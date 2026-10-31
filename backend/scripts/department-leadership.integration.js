// Synthetic fixtures exist only in this disposable local database, never production.
const { Client } = require('pg');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const {
  DepartmentLeadershipService,
} = require('../dist/modules/department-leadership/department-leadership.service');
const {
  PrincipalWorkspaceController,
} = require('../dist/modules/department-leadership/department-leadership.controller');
const {
  configuredReportingOfficer,
} = require('../dist/modules/department-leadership/reporting-officer');
const { approvedSids, mapEmails } = require('./pharmacy-student-email-mapping');
async function main() {
  const name = `falcon_leadership_test_${process.pid}_${Date.now()}`;
  const admin = new Client({ host: '/tmp', database: 'postgres' });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  const c = new Client({ host: '/tmp', database: name });
  try {
    await c.connect();
    await c.query(`CREATE TABLE tenants(tenant_id uuid PRIMARY KEY,subdomain text,is_active boolean);
   CREATE TABLE roles(role_id int PRIMARY KEY,role_name text);
   CREATE TABLE schools(school_id int PRIMARY KEY,campus_id int,deleted_at timestamptz,dean_user_id uuid);
   CREATE TABLE departments(dept_id int PRIMARY KEY,school_id int,hod_user_id uuid,deleted_at timestamptz);
   CREATE TABLE users(user_id uuid PRIMARY KEY,tenant_id uuid,name text,official_email text,dept_id int,role_id int,is_active boolean DEFAULT true,deleted_at timestamptz,password_hash text,reporting_officer_id uuid,onboarding_profile jsonb DEFAULT '{}'::jsonb);
   CREATE TABLE student_profiles(user_id uuid PRIMARY KEY,tenant_id uuid,student_login_id text,program_name text,status text,deleted_at timestamptz,enrollment_no text);
   CREATE TABLE hierarchy_assignments(tenant_id uuid,user_id uuid,assignment_type text);
   CREATE TABLE academic_courses(course_id uuid PRIMARY KEY,tenant_id uuid,course_code text,course_name text,deleted_at timestamptz);
   CREATE TABLE academic_course_allocations(tenant_id uuid,faculty_user_id uuid,course_id uuid,status text);
   CREATE TABLE student_course_enrollments(tenant_id uuid,student_user_id uuid,course_id uuid);
   CREATE TABLE course_attendance_logs(log_id uuid PRIMARY KEY,tenant_id uuid,attendance_data jsonb);
   INSERT INTO roles VALUES(1,'Faculty'),(2,'HOD');INSERT INTO schools VALUES(1,1,NULL,NULL);INSERT INTO departments VALUES(43,1,NULL,NULL);`);
    const migrationSql = fs.readFileSync(
        path.join(
          __dirname,
          '../migrations/20261029180000_department_leadership.sql',
        ),
        'utf8',
      );
    // DDL must remain inside the runner's transaction, including on failure.
    await c.query('BEGIN');
    await c.query(migrationSql);
    await c.query('ROLLBACK');
    assert.equal(
      (await c.query("SELECT to_regclass('department_leadership') AS relation")).rows[0].relation,
      null,
    );
    await c.query(migrationSql);
    const tenant = randomUUID(),
      other = randomUUID();
    await c.query(
      "INSERT INTO tenants VALUES($1,'sgvu',true),($2,'other',true)",
      [tenant, other],
    );
    const principal = randomUUID(),
      hod = randomUUID(),
      replacement = randomUUID(),
      teacher = randomUUID(),
      higher = randomUUID(),
      actor = randomUUID();
    for (const [id, dept, role] of [
      [principal, 43, 1],
      [hod, 43, 2],
      [replacement, 43, 1],
      [teacher, 43, 1],
      [higher, null, 1],
      [actor, 43, 1],
    ])
      await c.query(
        "INSERT INTO users(user_id,tenant_id,name,official_email,dept_id,role_id,password_hash,onboarding_profile) VALUES($1::uuid,$2,$1::uuid::text,$1::uuid::text||'@example.edu',$3,$4,'unchanged-hash','{\"retain\":\"yes\"}')",
        [id, tenant, dept, role],
      );
    const db = {
      query: async (sql, args) => (await c.query(sql, args)).rows,
      transaction: async (_level, fn) => {
        await c.query('BEGIN');
        try {
          const result = await fn({ query: db.query });
          await c.query('COMMIT');
          return result;
        } catch (e) {
          await c.query('ROLLBACK');
          throw e;
        }
      },
    };
    const auth = { tenant_id: tenant, user_id: actor, role: 'SuperAdmin' };
    const service = new DepartmentLeadershipService(db, {
      resolveCampusIds: async () => null,
    });
    await service.configure(
      auth,
      43,
      { structure: 'PRINCIPAL_HOD', higher_officer_id: higher },
      0,
    );
    await service.appoint(
      auth,
      43,
      'PRINCIPAL',
      'principal.pharma@example.edu',
      principal,
      1,
    );
    await service.appoint(auth, 43, 'HOD', 'hod.pharma@example.edu', hod, 2);
    assert.equal(
      (
        await c.query(
          'SELECT reporting_officer_id FROM users WHERE user_id=$1',
          [teacher],
        )
      ).rows[0].reporting_officer_id,
      principal,
    );
    assert.equal(
      (await configuredReportingOfficer(db.query, tenant, principal)).officer,
      higher,
    );
    assert.equal(
      (await service.resolveAlias(tenant, 'PRINCIPAL.PHARMA@EXAMPLE.EDU'))
        .user_id,
      principal,
    );
    assert.equal(
      await service.resolveAlias(other, 'principal.pharma@example.edu'),
      undefined,
    );
    await service.appoint(
      auth,
      43,
      'HOD',
      'hod.pharma@example.edu',
      replacement,
      3,
    );
    assert.equal((await service.context(tenant, hod)).offices.length, 0);
    assert.equal(
      (await service.resolveAlias(tenant, 'hod.pharma@example.edu')).user_id,
      replacement,
    );
    assert.equal(
      (
        await c.query(
          'SELECT revision FROM department_office_session_revisions WHERE user_id=$1',
          [hod],
        )
      ).rows[0].revision,
      2,
    );
    await assert.rejects(
      service.appoint(auth, 43, 'HOD', 'hod.pharma@example.edu', hod, 3),
      /configuration changed/,
    );
    const stranger = { ...auth, tenant_id: other };
    await assert.rejects(service.read(stranger, 43), /outside/);
    await service.appoint(auth, 43, 'HOD', 'hod.pharma@example.edu', null, 4);
    await service.configure(
      auth,
      43,
      { structure: 'PRINCIPAL_ONLY', higher_officer_id: higher },
      5,
    );
    await assert.rejects(
      service.appoint(auth, 43, 'HOD', 'hod.pharma@example.edu', hod, 6),
      /disabled/,
    );
    await service.appoint(
      auth,
      43,
      'PRINCIPAL',
      'principal.pharma@example.edu',
      null,
      6,
    );
    await assert.rejects(
      configuredReportingOfficer(db.query, tenant, teacher),
      /not configured/,
    );
    await service.configure(
      auth,
      43,
      { structure: 'HOD_ONLY', higher_officer_id: higher },
      7,
    );
    await service.appoint(auth, 43, 'HOD', 'hod.pharma@example.edu', hod, 8);
    assert.equal(
      (await configuredReportingOfficer(db.query, tenant, teacher)).officer,
      hod,
    );
    assert.equal(
      (
        await c.query(
          "SELECT count(*)::int n FROM users WHERE password_hash<>'unchanged-hash'",
        )
      ).rows[0].n,
      0,
    );
    // Restore both offices and verify real overview SQL rejects an unappointed actor.
    await service.configure(
      auth,
      43,
      { structure: 'PRINCIPAL_HOD', higher_officer_id: higher },
      9,
    );
    await service.appoint(
      auth,
      43,
      'PRINCIPAL',
      'principal.pharma@example.edu',
      principal,
      10,
    );
    for (const sid of approvedSids()) {
      const id = randomUUID();
      await c.query(
        "INSERT INTO users(user_id,tenant_id,name,official_email,dept_id,role_id,password_hash,onboarding_profile) VALUES($1,$2,'Synthetic student',$3,43,1,'unchanged-hash','{\"retain\":\"yes\"}')",
        [id, tenant, `${sid}@pending.invalid`],
      );
      await c.query(
        "INSERT INTO student_profiles VALUES($1,$2,$3,'B.Pharm','ACTIVE',NULL,$3)",
        [id, tenant, sid],
      );
    }
    const preview = await mapEmails(c, false);
    assert.equal(preview.eligible, 151);
    assert.equal(preview.applied, false);
    assert.equal(
      (
        await c.query(
          'SELECT count(*)::int n FROM student_identity_email_changes',
        )
      ).rows[0].n,
      0,
    );
    const applied = await mapEmails(c, true);
    assert.equal(applied.eligible, 151);
    assert.equal(applied.applied, true);
    assert(
      applied.students.every(
        (s) => s.email === s.sid + '.student@mygyanvihar.com',
      ),
    );
    const replay = await mapEmails(c, true);
    assert.equal(replay.eligible, 151);
    assert.equal(
      (
        await c.query(
          'SELECT count(*)::int n FROM student_identity_email_changes',
        )
      ).rows[0].n,
      151,
    );
    assert.equal(
      (
        await c.query(
          "SELECT count(*)::int n FROM users WHERE password_hash<>'unchanged-hash' OR onboarding_profile->>'retain'<>'yes'",
        )
      ).rows[0].n,
      0,
    );
    const overview = new PrincipalWorkspaceController(service, db);
    const view = await overview.overview({
      user: { user_id: principal, tenant_id: tenant, role: 'Principal' },
    });
    assert.equal(view.students.length, 151);
    await assert.rejects(
      overview.overview({
        user: { user_id: teacher, tenant_id: tenant, role: 'Principal' },
      }),
      /No active Principal/,
    );
    console.log(
      'PASS: actual SQL migration, three structures, replacement/revocation, scoped aliases, unchanged passwords, 151 email dry-run/apply/replay, authenticated Principal overview',
    );
  } finally {
    await c.end();
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await admin.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
