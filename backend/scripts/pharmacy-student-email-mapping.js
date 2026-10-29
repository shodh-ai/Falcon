/* Default: read-only preview. Never changes a password or an academic relationship. */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
function approvedSids() {
  const sql = fs.readFileSync(
    path.join(
      __dirname,
      '../migrations/20261009120000_pharmacy_sem1_student_onboarding.sql',
    ),
    'utf8',
  );
  const sids = [...sql.matchAll(/^  \('(\d+)', '/gm)].map((m) => m[1]);
  if (
    sids.length !== 151 ||
    new Set(sids).size !== 151 ||
    sids.includes('2646383')
  )
    throw Error('Approved cohort source failed integrity validation');
  return sids;
}
async function mapEmails(c, apply = false) {
  await c.query(
    apply ? 'BEGIN ISOLATION LEVEL SERIALIZABLE' : 'BEGIN READ ONLY',
  );
  try {
    const tenants = await c.query(
      "SELECT tenant_id FROM tenants WHERE subdomain='sgvu' AND is_active=true",
    );
    if (tenants.rows.length !== 1)
      throw Error('Expected one active SGVU tenant');
    const tenant = tenants.rows[0].tenant_id;
    if (apply)
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `${tenant}:pharmacy-student-email-v1`,
      ]);
    const result = await c.query(
      `SELECT u.user_id,u.name,u.official_email,u.password_hash,sp.student_login_id,sp.program_name,sp.status,u.is_active,
    u.dept_id,u.deleted_at AS user_deleted,sp.deleted_at AS profile_deleted
    FROM student_profiles sp JOIN users u ON u.user_id=sp.user_id AND u.tenant_id=sp.tenant_id
    WHERE sp.tenant_id=$1 AND sp.student_login_id=ANY($2) ORDER BY sp.student_login_id`,
      [tenant, approvedSids()],
    );
    if (
      result.rows.length !== 151 ||
      new Set(result.rows.map((x) => x.student_login_id)).size !== 151
    )
      throw Error(
        'Missing or duplicate approved student identities; no changes made',
      );
    const eligible = result.rows.filter(
      (x) =>
        x.is_active &&
        !x.user_deleted &&
        !x.profile_deleted &&
        x.status === 'ACTIVE',
    );
    if (eligible.some((x) => x.dept_id !== 43))
      throw Error(
        'Approved student is mapped outside Pharmacy; review required',
      );
    const rows = eligible.map((x) => ({
      ...x,
      email: `${x.student_login_id}.student@mygyanvihar.com`,
    }));
    for (const row of rows) {
      const collision = await c.query(
        'SELECT user_id FROM users WHERE lower(official_email)=$1 AND user_id<>$2',
        [row.email, row.user_id],
      );
      if (collision.rows.length)
        throw Error(`Email collision for SID ${row.student_login_id}`);
    }
    const snapshot = async () =>
      (
        await c.query(
          `SELECT
   (SELECT md5(coalesce(string_agg(md5(row_to_json(x)::text),'' ORDER BY log_id),'')) FROM course_attendance_logs x WHERE tenant_id=$1) AS attendance,
   (SELECT md5(coalesce(string_agg(md5(row_to_json(x)::text),'' ORDER BY student_user_id,course_id),'')) FROM student_course_enrollments x WHERE tenant_id=$1) AS enrollments,
   (SELECT md5(coalesce(string_agg(coalesce(password_hash,''),'' ORDER BY user_id),'')) FROM users WHERE tenant_id=$1) AS passwords`,
          [tenant],
        )
      ).rows[0];
    const before = await snapshot();
    if (apply) {
      for (const row of rows) {
        const prior = await c.query(
          'SELECT * FROM student_identity_email_changes WHERE tenant_id=$1 AND user_id=$2',
          [tenant, row.user_id],
        );
        if (
          prior.rows.length &&
          (prior.rows[0].new_email !== row.email ||
            prior.rows[0].student_login_id !== row.student_login_id)
        )
          throw Error('An earlier email mapping conflicts; review required');
        if(prior.rows.length){
          if(row.official_email!==row.email)throw Error('A mapped student email was changed after publication; review required');
          // Replay must not overwrite later mailbox/contact administration.
          continue;
        }
        await c.query(
          `INSERT INTO student_identity_email_changes(tenant_id,user_id,student_login_id,old_email,new_email)
     VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,user_id) DO NOTHING`,
          [
            tenant,
            row.user_id,
            row.student_login_id,
            row.official_email,
            row.email,
          ],
        );
        await c.query(
          `UPDATE users SET official_email=$1,onboarding_profile=jsonb_set(coalesce(onboarding_profile,'{}'::jsonb),'{email_pending}','true'::jsonb,true)
      WHERE user_id=$2 AND tenant_id=$3`,
          [row.email, row.user_id, tenant],
        );
      }
      if (JSON.stringify(before) !== JSON.stringify(await snapshot()))
        throw Error(
          'Protected passwords/enrollments/attendance changed; aborted',
        );
    }
    const report = {
      applied: apply,
      generated_at: new Date().toISOString(),
      source: 'approved Pharmacy admissions migration',
      eligible: rows.length,
      excluded: result.rows
        .filter((x) => !eligible.includes(x))
        .map((x) => ({
          sid: x.student_login_id,
          reason: 'Inactive or deleted account/profile',
        })),
      mailbox_provisioned: false,
      login_url: 'https://falcon.jataka.io/',
      students: rows.map((x) => ({
        name: x.name,
        programme: x.program_name,
        sid: x.student_login_id,
        email: x.email,
        password_instruction:
          'Existing password unchanged - use your current password.',
      })),
    };
    await c.query(apply ? 'COMMIT' : 'ROLLBACK');
    return report;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  }
}
if (require.main === module) {
  const args = process.argv.slice(2),
    out = args[args.indexOf('--output') + 1];
  if (!args.includes('--output') || !out)
    throw Error('--output requires a private local report path');
  const c = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE || 'university_governance',
  });
  c.connect()
    .then(() => mapEmails(c, args.includes('--apply')))
    .then((r) => {
      fs.writeFileSync(out, JSON.stringify(r, null, 2), {
        mode: 0o600,
        flag: 'wx',
      });
      console.log(
        JSON.stringify({
          applied: r.applied,
          eligible: r.eligible,
          excluded: r.excluded.length,
          report: out,
        }),
      );
    })
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(() => c.end());
}
module.exports = { approvedSids, mapEmails };
