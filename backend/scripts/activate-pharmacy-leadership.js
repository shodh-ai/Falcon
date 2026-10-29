/* Explicit, audited opt-in. Default read-only. Run after schema deployment/build. */
const fs = require('fs');
const path = require('path');
const { DataSource } = require('typeorm');
const {
  DepartmentLeadershipService,
} = require('../dist/modules/department-leadership/department-leadership.service');
const {
  CampusScopeService,
} = require('../dist/common/campus-scope/campus-scope.service');
const args = process.argv.slice(2);
const value = (flag) =>
  args.includes(flag) ? args[args.indexOf(flag) + 1] : null;
async function main() {
  const actorId = value('--actor'),
    backup = value('--backup-dir'),
    apply = args.includes('--apply');
  if (!actorId)
    throw Error('--actor must identify the authorizing Campus/Super Admin');
  if (apply && (!backup || !path.isAbsolute(backup)))
    throw Error(
      '--backup-dir must be an absolute private persistent directory for apply',
    );
  const db = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    username: process.env.DB_USERNAME || process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE || 'university_governance',
  });
  await db.initialize();
  try {
    return await db.transaction('SERIALIZABLE', async (m) => {
      await m.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        'sgvu:pharmacy-leadership-v1',
      ]);
      const tenants = await m.query(
        "SELECT tenant_id FROM tenants WHERE subdomain='sgvu' AND is_active=true",
      );
      if (tenants.length !== 1) throw Error('Expected one active SGVU tenant');
      const tenant = tenants[0].tenant_id;
      const actor = await m.query(
        `SELECT u.user_id,r.role_name FROM users u JOIN roles r ON r.role_id=u.role_id
   WHERE u.user_id=$1 AND u.tenant_id=$2 AND u.is_active=true AND u.deleted_at IS NULL AND r.role_name IN ('CampusAdmin','SuperAdmin')`,
        [actorId, tenant],
      );
      if (actor.length !== 1)
        throw Error(
          'Actor must be an active primary Campus/Super Admin in SGVU',
        );
      const auth = {
        user_id: actorId,
        tenant_id: tenant,
        role: actor[0].role_name,
      };
      const scopedDb = {
        query: m.query.bind(m),
        transaction: (_level, fn) => fn(m),
      };
      const scope = new CampusScopeService(scopedDb);
      const service = new DepartmentLeadershipService(scopedDb, scope);
      const staff = await m.query(
        `SELECT u.user_id,u.official_email,p.employee_id FROM users u JOIN hr_employee_profiles p ON p.user_id=u.user_id AND p.tenant_id=u.tenant_id
   WHERE u.tenant_id=$1 AND u.dept_id=43 AND u.is_active=true AND u.deleted_at IS NULL AND lower(u.official_email)=ANY($2)`,
        [
          tenant,
          ['manish1.gupta@mygyanvihar.com', 'hitesh.kumar@mygyanvihar.com'],
        ],
      );
      const principal = staff.filter(
        (x) =>
          x.official_email.toLowerCase() === 'manish1.gupta@mygyanvihar.com' &&
          String(x.employee_id) === '5359',
      );
      const hod = staff.filter(
        (x) =>
          x.official_email.toLowerCase() === 'hitesh.kumar@mygyanvihar.com' &&
          String(x.employee_id) === '5091',
      );
      if (principal.length !== 1 || hod.length !== 1)
        throw Error(
          'Confirmed HR identities do not reconcile; refusing activation',
        );
      const current = await service.read(auth, 43);
      if (current.config) {
        if (
          current.config.structure === 'PRINCIPAL_HOD' &&
          current.offices.some(
            (o) =>
              o.kind === 'PRINCIPAL' &&
              o.user_id === principal[0].user_id &&
              o.login_alias === 'principal.pharma@mygyanvihar.com',
          ) &&
          current.offices.some(
            (o) =>
              o.kind === 'HOD' &&
              o.user_id === hod[0].user_id &&
              o.login_alias === 'hod.pharma@mygyanvihar.com',
          )
        )
          return { already_applied: true };
        throw Error(
          'Existing leadership differs from reviewed publication; use admin revision-controlled changes instead',
        );
      }
      const preview = {
        apply,
        tenant_id: tenant,
        dept_id: 43,
        structure: 'PRINCIPAL_HOD',
        principal: principal[0],
        hod: hod[0],
        higher_officer_id: value('--higher-officer') ?? null,
        head_requests_blocked_until_higher_officer: !value('--higher-officer'),
      };
      if (!apply) return preview;
      fs.mkdirSync(backup, { mode: 0o700 });
      const snapshot = {
        preview,
        users: await m.query(
          'SELECT * FROM users WHERE tenant_id=$1 AND dept_id=43',
          [tenant],
        ),
        department: await m.query('SELECT * FROM departments WHERE dept_id=43'),
        events: await m.query(
          'SELECT * FROM department_leadership_events WHERE tenant_id=$1 AND dept_id=43',
          [tenant],
        ),
      };
      fs.writeFileSync(
        path.join(backup, 'before.json'),
        JSON.stringify(snapshot, null, 2),
        { mode: 0o600, flag: 'wx' },
      );
      const first = await service.configure(
        auth,
        43,
        {
          structure: 'PRINCIPAL_HOD',
          higher_officer_id: value('--higher-officer') ?? null,
        },
        0,
      );
      const second = await service.appoint(
        auth,
        43,
        'PRINCIPAL',
        'principal.pharma@mygyanvihar.com',
        principal[0].user_id,
        first.revision,
      );
      await service.appoint(
        auth,
        43,
        'HOD',
        'hod.pharma@mygyanvihar.com',
        hod[0].user_id,
        second.revision,
      );
      const after = await m.query(
        'SELECT * FROM users WHERE tenant_id=$1 AND dept_id=43',
        [tenant],
      );
      const protectedFields = (row) =>
        Object.fromEntries(
          Object.entries(row).filter(
            ([key]) =>
              !['reporting_officer_id', 'leadership_auth_revision'].includes(
                key,
              ),
          ),
        );
      for (const old of snapshot.users) {
        const now = after.find((x) => x.user_id === old.user_id);
        if (
          JSON.stringify(protectedFields(old)) !==
          JSON.stringify(protectedFields(now))
        )
          throw Error('Unexpected personal account data change; rolling back');
      }
      return { ...preview, applied: true, backup };
    });
  } finally {
    await db.destroy();
  }
}
main()
  .then((r) => console.log(JSON.stringify(r, null, 2)))
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
