// Disposable local PostgreSQL only. No production data or credentials.
const { Client, Pool } = require('pg');
const { randomUUID } = require('crypto');
const assert = require('assert/strict');
const fs = require('fs');
const {
  PrincipalOversightService,
} = require('../dist/modules/academics/principal-oversight.service');
const {
  AcademicSessionChangesService,
} = require('../dist/modules/academics/academic-session-changes.service');
const {
  configuredReportingOfficer,
} = require('../dist/modules/department-leadership/reporting-officer');
async function main() {
  const name = `falcon_principal_test_${process.pid}_${Date.now()}`;
  const admin = new Client({
    host: process.env.PGHOST || '/tmp',
    database: 'postgres',
  });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  let pool;
  const c = new Client({ host: process.env.PGHOST || '/tmp', database: name });
  await c.connect();
  try {
    await c.query(`CREATE TABLE tenants(tenant_id uuid PRIMARY KEY);CREATE TABLE roles(role_id int PRIMARY KEY,role_name text);
 CREATE TABLE departments(dept_id int PRIMARY KEY,school_id int,hod_user_id uuid,deleted_at timestamptz);
 CREATE TABLE schools(school_id int PRIMARY KEY,dean_user_id uuid);
 CREATE TABLE users(user_id uuid PRIMARY KEY,tenant_id uuid,dept_id int,name text,official_email text,role_id int,is_active boolean DEFAULT true,deleted_at timestamptz);
 CREATE TABLE iam_programs(program_name text, program_code text, dept_id int, deleted_at timestamptz);
 CREATE TABLE academic_courses(course_id uuid PRIMARY KEY,tenant_id uuid,course_code text,course_name text);
 CREATE TABLE academic_timetables(timetable_id uuid PRIMARY KEY,tenant_id uuid,course_id uuid,faculty_user_id uuid,day_of_week int,start_time time,end_time time,room text,section text,deleted_at timestamptz,valid_from date,valid_to date);
 CREATE TABLE academic_course_allocations(tenant_id uuid,course_id uuid,academic_year text,program_name text,semester text,status text);
 CREATE TABLE academic_class_moves(move_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,change_group_id uuid,source_timetable_id uuid,course_id uuid,original_faculty_id uuid,requested_by_user_id uuid,move_type text,reason text,status text,source_date date,target_date date,target_start_time time,target_end_time time,target_room text,decided_by_user_id uuid,decided_at timestamptz,created_at timestamptz DEFAULT now());
 CREATE TABLE course_attendance_logs(tenant_id uuid,timetable_id uuid,date date,course_id uuid);
 CREATE TABLE student_course_enrollments(tenant_id uuid,course_id uuid,student_user_id uuid,status text,section_code text);
 CREATE TABLE academic_proxy_requests(tenant_id uuid,timetable_id uuid,date_of_proxy date,status text,proxy_faculty_id uuid);
 CREATE TABLE staff_leave_requests(tenant_id uuid,staff_user_id uuid,status text,start_date date,end_date date);
 INSERT INTO roles VALUES(1,'Faculty'),(2,'HOD'),(3,'Principal');INSERT INTO departments VALUES(43,1,NULL,NULL),(44,2,NULL,NULL);`);
    await c.query(
      fs.readFileSync(
        require('path').join(
          __dirname,
          '../migrations/20261029180000_department_leadership.sql',
        ),
        'utf8',
      ),
    );
    await c.query(`ALTER TABLE academic_courses ADD COLUMN deleted_at timestamptz, ADD COLUMN credits int;
      ALTER TABLE departments ADD COLUMN dept_name text;
      ALTER TABLE academic_course_allocations ADD COLUMN allocation_id uuid DEFAULT gen_random_uuid(), ADD COLUMN faculty_user_id uuid, ADD COLUMN updated_at timestamptz;
      ALTER TABLE course_attendance_logs ADD COLUMN deleted_at timestamptz, ADD COLUMN faculty_user_id uuid;
      CREATE TABLE academic_faculty_load_declarations(tenant_id uuid,faculty_user_id uuid,academic_year text,status text,reason text,revision int);
      CREATE TABLE academic_timetable_publications(publication_id uuid,tenant_id uuid,state text,activated_on date,manifest jsonb);
      CREATE TABLE academic_timetable_source_entries(tenant_id uuid,publication_id uuid,faculty_user_ids uuid[],state text,entry jsonb);
      CREATE TABLE course_modules(tenant_id uuid,course_id uuid,faculty_user_id uuid,status text,deleted_at timestamptz);
      CREATE TABLE academic_marks(tenant_id uuid,course_id uuid,student_user_id uuid,status text);
      CREATE TABLE task_assignments(tenant_id uuid,dept_id int,assigned_to uuid,status text,deleted_at timestamptz,assigned_at timestamptz);`);
    await c.query(`CREATE TABLE campus_events(event_id uuid PRIMARY KEY,tenant_id uuid,title text,status text,
      advisor_approval text,hod_approval text,dean_approval text,estate_approval text,funds_needed numeric,finance_approval text);`);
    await c.query(fs.readFileSync(require('path').join(__dirname,
      '../migrations/20261031152000_event_class_cohorts.sql'), 'utf8'));
    const tenant = randomUUID(),
      other = randomUUID(),
      principal = randomUUID(),
      hod = randomUUID(),
      teacher = randomUUID(),
      student = randomUUID(),
      foreign = randomUUID(),
      course = randomUUID(),
      slot1 = randomUUID(),
      slot2 = randomUUID();
    await c.query('INSERT INTO tenants VALUES($1),($2)', [tenant, other]);
    for (const [id, dept, role] of [
      [principal, 43, 3],
      [hod, 43, 2],
      [teacher, 43, 1],
      [foreign, 44, 3],
    ])
      await c.query(
        'INSERT INTO users(user_id,tenant_id,dept_id,name,official_email,role_id) VALUES($1::uuid,$2,$3,$1::uuid::text,$1::uuid::text,$4)',
        [id, tenant, dept, role],
      );
    await c.query(
      "INSERT INTO department_leadership VALUES($1,43,'PRINCIPAL_HOD',NULL,1),($1,44,'PRINCIPAL_ONLY',NULL,1)",
      [tenant],
    );
    for (const [kind, user, dept] of [
      ['PRINCIPAL', principal, 43],
      ['HOD', hod, 43],
      ['PRINCIPAL', foreign, 44],
    ]) {
      const {
        rows: [o],
      } = await c.query(
        'INSERT INTO department_offices(tenant_id,dept_id,kind,login_alias) VALUES($1,$2,$3,$4) RETURNING office_id',
        [tenant, dept, kind, `${kind.toLowerCase()}${dept}@example.edu`],
      );
      await c.query(
        'INSERT INTO department_office_appointments(office_id,user_id,assigned_by) VALUES($1,$2,$2)',
        [o.office_id, user],
      );
    }
    pool = new Pool({ host: process.env.PGHOST || '/tmp', database: name });
    const query = async (sql, args) => (await pool.query(sql, args)).rows;
    const db = {
      query,
      transaction: async (fn) => {
        const tx = await pool.connect();
        await tx.query('BEGIN');
        try {
          const r = await fn({
            query: async (sql, args) => (await tx.query(sql, args)).rows,
          });
          await tx.query('COMMIT');
          return r;
        } catch (e) {
          await tx.query('ROLLBACK');
          throw e;
        } finally {
          tx.release();
        }
      },
    };
    const notifications = [];
    const changes = new AcademicSessionChangesService(db, {
      timetableChanged: (n) => notifications.push(n),
    });
    const svc = new PrincipalOversightService(db, changes);
    const p = { user_id: principal, tenant_id: tenant },
      h = { user_id: hod, tenant_id: tenant };
    assert.equal(
      (await configuredReportingOfficer(query, tenant, teacher)).officer,
      hod,
    );
    assert.equal(
      (await configuredReportingOfficer(query, tenant, hod)).officer,
      principal,
    );
    await assert.rejects(
      configuredReportingOfficer(query, tenant, principal),
      /not configured/,
    );
    await assert.rejects(
      svc.list({ user_id: foreign, tenant_id: tenant }, 'PRINCIPAL', '43'),
      /No active/,
    );
    await assert.rejects(
      svc.list({ user_id: principal, tenant_id: other }, 'PRINCIPAL'),
      /No active/,
    );
    const key = randomUUID();
    const input = {
      kind: 'FOLLOW_UP',
      title: 'Review attendance records',
      reason: 'Please investigate the missing attendance evidence',
      due_date: '2030-07-15',
    };
    let follow = await svc.create(p, 'PRINCIPAL', input, key);
    assert.equal(follow.status, 'PENDING_HOD');
    assert.equal(
      (await svc.create(p, 'PRINCIPAL', input, key)).case_id,
      follow.case_id,
    );
    await assert.rejects(
      svc.create(
        p,
        'PRINCIPAL',
        { ...input, reason: 'A different command with the same key' },
        key,
      ),
      /Idempotency/,
    );
    follow = await svc.act(
      h,
      'HOD',
      follow.case_id,
      1,
      {
        action: 'RESPOND',
        note: 'Records reviewed and corrective action completed',
      },
      randomUUID(),
    );
    assert.equal(follow.status, 'PENDING_PRINCIPAL');
    await assert.rejects(
      svc.act(
        p,
        'PRINCIPAL',
        follow.case_id,
        1,
        { action: 'CLOSE', note: 'Evidence reviewed' },
        randomUUID(),
      ),
      /Case changed/,
    );
    follow = await svc.act(
      p,
      'PRINCIPAL',
      follow.case_id,
      2,
      { action: 'RETURN', note: 'Please include the class session evidence' },
      randomUUID(),
    );
    assert.equal(follow.status, 'RETURNED');
    follow = await svc.act(
      h,
      'HOD',
      follow.case_id,
      3,
      {
        action: 'RESPOND',
        note: 'The requested class session evidence is included',
      },
      randomUUID(),
    );
    follow = await svc.act(
      p,
      'PRINCIPAL',
      follow.case_id,
      4,
      { action: 'CLOSE', note: 'Evidence reviewed and follow-up closed' },
      randomUUID(),
    );
    assert.equal(follow.status, 'CLOSED');
    assert.equal((await svc.list(p, 'PRINCIPAL')).cases[0].status, 'CLOSED');
    await c.query(
      "INSERT INTO academic_courses(course_id,tenant_id,course_code,course_name) VALUES($1,$2,'TEST101','Synthetic test course')",
      [course, tenant],
    );
    for (const [id, start, end] of [
      [slot1, '09:00', '10:00'],
      [slot2, '11:00', '12:00'],
    ])
      await c.query(
        "INSERT INTO academic_timetables VALUES($1,$2,$3,$4,1,$5,$6,'R1','A',NULL,NULL,NULL)",
        [id, tenant, course, teacher, start, end],
      );
    await c.query(
      "INSERT INTO academic_course_allocations(tenant_id,course_id,academic_year,program_name,semester,status) VALUES($1,$2,'2030-2031','BPHARM','I','ACTIVE')",
      [tenant, course],
    );
    await c.query(
      "INSERT INTO student_course_enrollments VALUES($1,$2,$3,'ENROLLED','A')",
      [tenant, course, student],
    );
    async function source(requester = teacher) {
      const group = randomUUID();
      for (const [slot, start, end] of [
        [slot1, '11:00', '12:00'],
        [slot2, '09:00', '10:00'],
      ])
        await c.query(
          `INSERT INTO academic_class_moves(tenant_id,change_group_id,source_timetable_id,course_id,original_faculty_id,requested_by_user_id,move_type,reason,status,source_date,target_date,target_start_time,target_end_time,target_room) VALUES($1,$2,$3,$4,$5,$6,'SWAP','Synthetic test','PENDING_HOD_APPROVAL','2030-07-01','2030-07-01',$7,$8,'R1')`,
          [tenant, group, slot, course, teacher, requester, start, end],
        );
      return group;
    }
    // Ordinary HOD path still applies directly, with no Principal case.
    let group = await source();
    await changes.decide(hod, tenant, group, 'APPROVE');
    assert.equal(
      (
        await query(
          'SELECT status FROM academic_class_moves WHERE change_group_id=$1',
          [group],
        )
      )[0].status,
      'APPROVED',
    );
    await c.query('DELETE FROM academic_class_moves');
    group = await source();
    let state = await svc.create(
      h,
      'HOD',
      {
        kind: 'TIMETABLE',
        source_id: group.toUpperCase(),
        title: 'Reserved timetable exception',
        reason: 'HOD recommends a review of this exceptional class swap',
      },
      randomUUID(),
    );
    await assert.rejects(
      changes.decide(hod, tenant, group.toUpperCase(), 'APPROVE'),
      /reserved to the Principal/,
    );
    assert.equal((await changes.listPendingForHod(hod,tenant)).length,0);
    // Validation failure preserves original records, stores approval separately and is retryable.
    await c.query(
      "INSERT INTO staff_leave_requests VALUES($1,$2,'HOD_APPROVED','2030-07-01','2030-07-01')",
      [tenant, teacher],
    );
    state = await svc.act(
      p,
      'PRINCIPAL',
      group,
      1,
      {
        action: 'APPROVE',
        note: 'Approved subject to mandatory scheduling validation',
      },
      randomUUID(),
    );
    assert.equal(state.status, 'APPLICATION_FAILED');
    assert.match(state.application_error, /approved leave/);
    assert.equal(
      (
        await query(
          'SELECT status FROM academic_class_moves WHERE change_group_id=$1',
          [group],
        )
      )[0].status,
      'PENDING_HOD_APPROVAL',
    );
    await c.query('DELETE FROM staff_leave_requests');
    const retry = randomUUID();
    state = await svc.act(
      p,
      'PRINCIPAL',
      group,
      state.revision,
      {
        action: 'RETRY',
        note: 'The approved leave conflict has been resolved',
      },
      retry,
    );
    assert.equal(state.status, 'APPLIED');
    const before = notifications.length;
    await svc.act(
      p,
      'PRINCIPAL',
      group,
      state.revision - 2,
      {
        action: 'RETRY',
        note: 'The approved leave conflict has been resolved',
      },
      retry,
    );
    assert.equal(notifications.length, before);
    assert.equal(
      (await svc.detail(p, 'PRINCIPAL', group)).sessions[0].status,
      'APPROVED',
    );
    await c.query('DELETE FROM academic_class_moves');
    group = await source();
    state = await svc.create(
      h,
      'HOD',
      {
        kind: 'TIMETABLE',
        source_id: group,
        title: 'Another exceptional request',
        reason: 'HOD recommends rejecting this exceptional swap',
      },
      randomUUID(),
    );
    state = await svc.act(
      p,
      'PRINCIPAL',
      group,
      1,
      {
        action: 'REJECT',
        note: 'Department evidence does not support this request',
      },
      randomUUID(),
    );
    assert.equal(state.status, 'REJECTED');
    assert.equal(
      (
        await query(
          'SELECT status FROM academic_class_moves WHERE change_group_id=$1',
          [group],
        )
      )[0].status,
      'REJECTED',
    );
    await c.query('DELETE FROM academic_class_moves');group=await source();
    state=await svc.create(h,'HOD',{kind:'TIMETABLE',source_id:group,title:'Recover blocked application',reason:'HOD recommends a review of this blocked request'},randomUUID());
    await c.query("INSERT INTO staff_leave_requests VALUES($1,$2,'HOD_APPROVED','2030-07-01','2030-07-01')",[tenant,teacher]);
    state=await svc.act(p,'PRINCIPAL',group,1,{action:'APPROVE',note:'Approval remains subject to source validation'},randomUUID());assert.equal(state.status,'APPLICATION_FAILED');
    state=await svc.act(p,'PRINCIPAL',group,state.revision,{action:'RETURN',note:'Please resolve this request through HOD review'},randomUUID());assert.equal(state.status,'RETURNED');
    assert.equal((await changes.listPendingForHod(hod,tenant)).length,1);
    await changes.decide(hod,tenant,group,'REJECT');assert.equal((await svc.detail(p,'PRINCIPAL',group)).state.status,'REJECTED');await c.query('DELETE FROM staff_leave_requests');
    // Returned requests use one case history; concurrent recommendations cannot create a second owner.
    await c.query('DELETE FROM academic_class_moves');
    group = await source();
    state = await svc.create(
      h,
      'HOD',
      {
        kind: 'TIMETABLE',
        source_id: group,
        title: 'Return and review exception',
        reason: 'HOD recommends this request for additional review',
      },
      randomUUID(),
    );
    state = await svc.act(
      p,
      'PRINCIPAL',
      group,
      1,
      {
        action: 'RETURN',
        note: 'Please add the missing departmental evidence',
      },
      randomUUID(),
    );
    state = await svc.act(
      h,
      'HOD',
      group,
      state.revision,
      {
        action: 'RESUBMIT',
        note: 'Additional departmental evidence has been provided',
      },
      randomUUID(),
    );
    assert.equal(state.status, 'PENDING_PRINCIPAL');
    await assert.rejects(
      svc.act(
        { user_id: foreign, tenant_id: tenant },
        'PRINCIPAL',
        group,
        state.revision,
        { action: 'APPROVE', note: 'This is outside the assigned department' },
        randomUUID(),
      ),
      /No active/,
    );
    const decisions = await Promise.allSettled([
      svc.act(
        p,
        'PRINCIPAL',
        group,
        state.revision,
        {
          action: 'REJECT',
          note: 'Evidence supports rejection of this exception',
        },
        randomUUID(),
      ),
      svc.act(
        p,
        'PRINCIPAL',
        group,
        state.revision,
        { action: 'REJECT', note: 'A concurrent duplicate rejection attempt' },
        randomUUID(),
      ),
    ]);
    assert.equal(decisions.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(decisions.filter((r) => r.status === 'rejected').length, 1);
    await c.query('DELETE FROM academic_class_moves');
    group = await source(hod);
    await assert.rejects(
      svc.create(
        h,
        'HOD',
        {
          kind: 'TIMETABLE',
          source_id: group,
          title: 'Disallowed self recommendation',
          reason: 'The proposer cannot recommend this own request',
        },
        randomUUID(),
      ),
      /proposer/,
    );
    await c.query('UPDATE academic_course_allocations SET faculty_user_id=$1',[teacher]);
    const projection=await svc.overview(p);assert.equal(projection.office.dept_id,43);
    assert.ok(Array.isArray(projection.workload));assert.ok(Array.isArray(projection.syllabus));assert.ok(Array.isArray(projection.iqac));
    await c.query('DELETE FROM academic_class_moves');group=await source();
    state=await svc.create(h,'HOD',{kind:'TIMETABLE',source_id:group,title:'Concurrent hand-back checks',reason:'HOD recommendation for a returned request'},randomUUID());
    state=await svc.act(p,'PRINCIPAL',group,1,{action:'RETURN',note:'Return this request for departmental resolution'},randomUUID());
    const race=await Promise.allSettled([svc.act(h,'HOD',group,state.revision,{action:'RESUBMIT',note:'Department evidence supplied for Principal review'},randomUUID()),changes.decide(hod,tenant,group,'REJECT')]);
    assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
    const liveCase=(await svc.detail(p,'PRINCIPAL',group)).state,liveSource=(await query('SELECT status FROM academic_class_moves WHERE change_group_id=$1',[group]))[0];
    assert.ok(liveCase.status==='PENDING_PRINCIPAL'&&liveSource.status==='PENDING_HOD_APPROVAL'||liveCase.status==='REJECTED'&&liveSource.status==='REJECTED');
    // Transfer revokes reads/decisions immediately, including idempotent replay.
    await c.query(
      'UPDATE department_office_appointments SET valid_to=now() WHERE user_id=$1',
      [principal],
    );
    await assert.rejects(svc.list(p, 'PRINCIPAL'), /No active/);
    await assert.rejects(svc.create(p, 'PRINCIPAL', input, key), /No active/);
    console.log(
      'PASS: real PostgreSQL: routine HOD application, Principal reserved application/rejection, leave collision, failed-application rollback/retry, idempotent replay, follow-up lifecycle, persistence after reload, cross-tenant/department isolation and appointment revocation.',
    );
  } finally {
    if (pool) await pool.end();
    await c.end();
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await admin.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
