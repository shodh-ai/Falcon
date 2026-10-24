'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { seedPortal, dateOffset } = require('./portal.cjs');

const PRIMARY_KEYS = {
  academic_mentorships: 'mentorship_id',
  mentorship_meetings: 'meeting_id',
  academic_proctor_interactions: 'interaction_id',
  student_certificates: 'certificate_id',
  helpdesk_tickets: 'ticket_id',
  admin_academic_calendar_events: 'event_id',
  university_policies: 'policy_id',
  student_policy_acknowledgements: 'ack_id',
  falcon_notifications: 'notification_id',
  course_modules: 'module_id',
  course_materials: 'material_id',
  course_material_visibility: 'visibility_id',
  course_announcements: 'announcement_id',
};

function harness() {
  let sequence = 0;
  const tenantId = 'smoke-tenant';
  const ids = {
    tenantId,
    studentId: 'student',
    facultyId: 'faculty',
    adminId: 'admin',
    campusId: 'campus',
    schoolId: 'school',
    deptId: 22,
    programId: 'program',
    courses: [
      {
        course_id: 'course-1',
        course_code: 'SMK101',
        allocation_id: 'allocation-1',
      },
    ],
  };
  const data = {
    users: ['student', 'faculty', 'admin'].map((user_id) => ({
      user_id,
      tenant_id: tenantId,
      is_active: true,
    })),
    academic_courses: [{ course_id: 'course-1', tenant_id: tenantId }],
  };
  for (const table of Object.keys(PRIMARY_KEYS)) data[table] = [];
  const calls = [];
  const mutations = [];
  const checks = [];
  const blocked = [];
  const tracks = new Map();
  const own = (table) =>
    data[table].filter((row) => !row.tenant_id || row.tenant_id === tenantId);
  const insert = (table, values) => {
    const row = { [PRIMARY_KEYS[table]]: `${table}-${++sequence}`, ...values };
    data[table].push(row);
    return row;
  };
  const ctx = {
    ids,
    seedDate: '2026-10-14',
    academicYear: '2026-2027',
    actors: { student: 'student', faculty: 'faculty', admin: 'admin' },
    check(name, condition, detail) {
      checks.push({ name, condition, detail });
    },
    blocked(name, reason) {
      blocked.push({ name, reason });
    },
    track(table, row, feature, created = false) {
      const key = `${table}:${row[PRIMARY_KEYS[table]]}`;
      if (!tracks.has(key)) tracks.set(key, { table, row, feature, created });
    },
    fixture(kind) {
      return {
        type: 'application/pdf',
        name: `${kind}.pdf`,
        buffer: Buffer.from('%PDF-1.4 synthetic unit fixture'),
      };
    },
    async ensureRow(table, values, match) {
      const row = data[table].find((candidate) =>
        Object.entries(match).every(([key, value]) => candidate[key] === value),
      );
      if (row) return row;
      mutations.push(`insert:${table}`);
      return insert(table, values);
    },
    db: {
      async query(sql, values) {
        assert.match(
          sql,
          /^SELECT \* FROM /,
          'portal module raw DB access must remain read-only',
        );
        const table = sql.match(/FROM "([a-z_]+)"/)[1];
        const keys = [...sql.matchAll(/"([a-z_]+)" = \$\d+/g)].map(
          (match) => match[1],
        );
        return {
          rows: data[table].filter((row) =>
            keys.every((key, index) => row[key] === values[index]),
          ),
        };
      },
    },
    async request(actor, method, path, body) {
      calls.push({ actor, method, path, body });
      if (method !== 'GET') mutations.push(`${method}:${path}`);
      if (method === 'POST' && path === '/api/academics/proctor/mentorships') {
        assert.equal(actor, 'admin');
        return insert('academic_mentorships', { ...body, is_active: true });
      }
      if (method === 'POST' && path === '/api/academics/proctor/meetings') {
        assert.equal(actor, 'student');
        const row = insert('mentorship_meetings', {
          student_user_id: 'student',
          proctor_user_id: 'faculty',
          topic: body.note,
          status: 'PENDING',
        });
        insert('academic_proctor_interactions', {
          student_user_id: 'student',
          proctor_user_id: 'faculty',
          interaction_type: 'MEETING',
          payload: { meeting_id: row.meeting_id },
          status: 'REQUESTED',
        });
        return row;
      }
      if (method === 'POST' && /meetings\/.+\/respond$/.test(path)) {
        assert.equal(actor, 'faculty');
        const row = data.mentorship_meetings.find((item) =>
          path.includes(item.meeting_id),
        );
        Object.assign(row, {
          status: body.status,
          proctor_remarks: body.remarks,
        });
        return row;
      }
      if (
        method === 'POST' &&
        path === '/api/academics/proctor/leave-requests'
      ) {
        assert.equal(actor, 'student');
        return insert('academic_proctor_interactions', {
          student_user_id: 'student',
          proctor_user_id: 'faculty',
          interaction_type: 'LEAVE_REQUEST',
          payload: body,
          status: 'PENDING',
        });
      }
      if (method === 'POST' && /leave-requests\/.+\/respond$/.test(path)) {
        assert.equal(actor, 'faculty');
        const row = data.academic_proctor_interactions.find((item) =>
          path.includes(item.interaction_id),
        );
        row.status = body.status;
        return row;
      }
      if (method === 'PATCH' && /certificates\/.+\/verify$/.test(path)) {
        assert.equal(actor, 'faculty');
        const row = data.student_certificates.find((item) =>
          path.includes(item.certificate_id),
        );
        Object.assign(row, {
          verification_status: body.status,
          points_awarded: body.points_awarded,
          verified_by_user_id: actor,
          verified_at: ctx.seedDate,
        });
        return row;
      }
      if (method === 'POST' && /courses\/.+\/modules$/.test(path)) {
        assert.equal(actor, 'faculty');
        return insert('course_modules', {
          tenant_id: tenantId,
          course_id: 'course-1',
          faculty_user_id: actor,
          ...body,
          status: 'PENDING',
        });
      }
      if (method === 'POST' && /courses\/.+\/announcements$/.test(path)) {
        assert.equal(actor, 'faculty');
        return insert('course_announcements', {
          tenant_id: tenantId,
          course_id: 'course-1',
          faculty_user_id: actor,
          ...body,
        });
      }
      if (method === 'POST' && path === '/api/helpdesk/tickets') {
        assert.equal(actor, 'student');
        return insert('helpdesk_tickets', {
          tenant_id: tenantId,
          student_user_id: actor,
          ...body,
          status: 'PENDING',
          ticket_ref: `SGVU-${sequence}`,
          sla_deadline: '2026-10-15T12:00:00Z',
        });
      }
      if (method === 'PATCH' && /tickets\/.+\/status$/.test(path)) {
        assert.equal(actor, 'admin');
        const row = data.helpdesk_tickets.find((item) =>
          path.includes(item.ticket_id),
        );
        row.status = body.status;
        if (body.status === 'RESOLVED')
          Object.assign(row, { resolved_at: ctx.seedDate, resolved_by: actor });
        return row;
      }
      if (method === 'POST' && /tickets\/.+\/messages$/.test(path)) {
        const row = data.helpdesk_tickets.find((item) =>
          path.includes(item.ticket_id),
        );
        (row.conversation ??= []).push({
          sender_user_id: actor,
          message: body.message,
        });
        return row;
      }
      if (method === 'POST' && path === '/api/admin-control/calendar') {
        assert.equal(actor, 'admin');
        return insert('admin_academic_calendar_events', {
          tenant_id: tenantId,
          created_by: actor,
          ...body,
        });
      }
      if (method === 'POST' && /policies\/.+\/acknowledge$/.test(path)) {
        return insert('student_policy_acknowledgements', {
          tenant_id: tenantId,
          student_user_id: actor,
          policy_id: data.university_policies.find((row) =>
            path.includes(row.policy_id),
          ).policy_id,
        });
      }
      if (method === 'PATCH' && /notifications\/.+\/read$/.test(path)) {
        const row = data.falcon_notifications.find((item) =>
          path.includes(item.notification_id),
        );
        row.is_read = true;
        return row;
      }
      assert.equal(method, 'GET', `Unexpected API mutation: ${method} ${path}`);
      assert.equal(actor, 'student');
      if (path === '/api/student/profile')
        return {
          onboarding_status: 'COMPLETED',
          name: '[SMOKE v1] Test Student',
          email: 'student@smoke.invalid',
          enrollment_no: 'SMOKE-001',
          mobile: '0000000000',
          blood_group: 'O+',
          abc_id: 'SMOKEABC001',
          gender: 'OTHER',
          date_of_birth: '2005-04-12',
          branch: 'Smoke Computing',
          session: '2026-2027',
          parent_details: {
            father_name: 'Fictional Father',
            mother_name: 'Fictional Mother',
            emergency_contact_name: 'Fictional Guardian',
            emergency_contact_phone: '0000000000',
          },
          address: {
            permanent: 'Fictional address',
            current: 'Fictional campus',
          },
        };
      if (path === '/api/academics/certificates/my-certificates')
        return own('student_certificates');
      if (path === '/api/helpdesk/tickets/my-tickets')
        return own('helpdesk_tickets');
      if (path === '/api/academics/proctor/meetings/my')
        return own('mentorship_meetings');
      if (path === '/api/academics/proctor/leave-requests/my')
        return own('academic_proctor_interactions').filter(
          (row) => row.interaction_type === 'LEAVE_REQUEST',
        );
      if (path === '/api/student/academic-calendar')
        return {
          events: own('admin_academic_calendar_events').map((row) => ({
            ...row,
            event_id: `university-${row.event_id}`,
          })),
        };
      if (path === '/api/student/policies') return own('university_policies');
      if (path === '/api/notifications?limit=100')
        return own('falcon_notifications');
      if (/courses\/.+\/workspace$/.test(path))
        return { modules: [{ materials: own('course_materials') }] };
      if (/courses\/.+\/announcements$/.test(path))
        return own('course_announcements');
      throw new Error(`Unexpected API read: ${path}`);
    },
    async upload(actor, path, fields, file) {
      calls.push({ actor, method: 'UPLOAD', path, fields, file });
      mutations.push(`UPLOAD:${path}`);
      assert.equal(file.type, 'application/pdf');
      assert.equal(file.buffer.subarray(0, 4).toString(), '%PDF');
      if (path === '/api/academics/certificates/upload') {
        assert.equal(actor, 'student');
        return insert('student_certificates', {
          tenant_id: tenantId,
          student_user_id: actor,
          ...fields,
          file_path: `/test/${sequence}.pdf`,
          original_filename: file.name,
          mime_type: file.type,
          file_size: file.buffer.length,
          verification_status: 'PENDING',
        });
      }
      if (/modules\/.+\/materials$/.test(path)) {
        assert.equal(actor, 'faculty');
        assert.equal(file.field, 'files');
        const module = data.course_modules.find((row) =>
          path.includes(row.module_id),
        );
        const material = insert('course_materials', {
          tenant_id: tenantId,
          course_id: module.course_id,
          module_id: module.module_id,
          faculty_user_id: actor,
          title: fields.title,
          file_path: '/test/material.pdf',
        });
        insert('course_material_visibility', {
          material_id: material.material_id,
          allocation_id: JSON.parse(fields.allocation_ids)[0],
        });
        return { materials: [material], module };
      }
      if (path === '/api/uploads/single') {
        assert.equal(actor, 'admin');
        return { path: `/test/policy-${sequence}.pdf`, storage: 'disk' };
      }
      throw new Error(`Unexpected upload: ${path}`);
    },
  };
  return { ctx, data, checks, calls, mutations, blocked, tracks };
}

test('stable seed dates use UTC and reject invalid dates', () => {
  assert.equal(dateOffset('2026-12-31', 1), '2027-01-01');
  assert.equal(dateOffset('2028-03-01', -1), '2028-02-29');
  assert.throws(() => dateOffset('2026-02-30', 0), /Invalid seedDate/);
  assert.throws(() => dateOffset(undefined, 0), /stable seedDate/);
});

test('portal fixture creates legitimate API workflows and is no-write on rerun', async () => {
  const { ctx, data, checks, calls, mutations, blocked, tracks } = harness();
  const refs = await seedPortal(ctx);
  assert.equal(refs.certificates.length, 3);
  assert.equal(refs.calendar.length, 3);
  assert.equal(refs.tickets.length, 3);
  assert.equal(refs.meetings.length, 2);
  assert.equal(refs.leaveRequests.length, 2);
  assert.equal(refs.policies.length, 2);
  assert.deepEqual(
    data.student_certificates.map((row) => row.verification_status),
    ['VERIFIED', 'REJECTED', 'PENDING'],
  );
  assert.deepEqual(
    data.helpdesk_tickets.map((row) => row.status),
    ['RESOLVED', 'PENDING', 'IN_PROGRESS'],
  );
  assert.ok(
    data.admin_academic_calendar_events.every((row) =>
      ['CAMPUS', 'DEPARTMENT', 'PROGRAMME'].includes(row.event_scope),
    ),
  );
  assert.ok(data.falcon_notifications.some((row) => row.is_read));
  assert.ok(data.falcon_notifications.some((row) => !row.is_read));
  assert.ok(checks.every((check) => check.condition));
  assert.ok(
    [...tracks.values()]
      .filter(
        (record) =>
          !['university_policies', 'falcon_notifications'].includes(
            record.table,
          ),
      )
      .every((record) => record.created),
    'API-created rows and publication/history side effects must be counted as created',
  );
  assert.equal(blocked.length, 4);
  assert.ok(
    !calls.some(
      (call) => call.method === 'DELETE' || /syllabus\/setup/.test(call.path),
    ),
  );
  const beforeMutations = mutations.length;
  const counts = Object.fromEntries(
    Object.entries(data).map(([table, rows]) => [table, rows.length]),
  );
  const rerun = await seedPortal(ctx);
  assert.deepEqual(rerun, refs);
  assert.equal(
    mutations.length,
    beforeMutations,
    'Rerun must not repeat uploads, notifications, messages or status transitions',
  );
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(data).map(([table, rows]) => [table, rows.length]),
    ),
    counts,
  );
});

test('wrong tenant or inactive actors stop before any mutation', async () => {
  for (const change of [
    (data) => {
      data.users[1].tenant_id = 'another-tenant';
    },
    (data) => {
      data.users[0].is_active = false;
    },
    (data) => {
      data.academic_courses[0].tenant_id = 'another-tenant';
    },
  ]) {
    const { ctx, data, mutations } = harness();
    change(data);
    await assert.rejects(seedPortal(ctx), /tenant ownership/);
    assert.equal(mutations.length, 0);
  }
});

test('existing different mentor is never reassigned', async () => {
  const { ctx, data, mutations } = harness();
  data.academic_mentorships.push({
    mentorship_id: 'existing',
    student_user_id: 'student',
    proctor_user_id: 'different-faculty',
    is_active: true,
  });
  await assert.rejects(seedPortal(ctx), /mentor assignment retained/);
  assert.equal(mutations.length, 0);
  assert.equal(
    data.academic_mentorships[0].proctor_user_id,
    'different-faculty',
  );
});

test('duplicate or archived natural keys fail instead of overwriting or recreating', async () => {
  for (const archived of [false, true]) {
    const { ctx, data, mutations } = harness();
    const mentor = {
      mentorship_id: 'existing',
      student_user_id: 'student',
      proctor_user_id: 'faculty',
      is_active: true,
    };
    data.academic_mentorships.push(
      archived ? { ...mentor, deleted_at: '2026-10-01' } : mentor,
    );
    if (!archived)
      data.academic_mentorships.push({ ...mentor, mentorship_id: 'duplicate' });
    await assert.rejects(
      seedPortal(ctx),
      archived ? /not archived/ : /unique smoke natural key/,
    );
    assert.equal(mutations.length, 0);
  }
});

test('changed decided state is not reset on rerun', async () => {
  const { ctx, data, mutations } = harness();
  await seedPortal(ctx);
  const pending = data.student_certificates.find(
    (row) => row.verification_status === 'PENDING',
  );
  pending.verification_status = 'VERIFIED';
  const count = mutations.length;
  await assert.rejects(seedPortal(ctx), /certificate verification workflow/);
  assert.equal(mutations.length, count);
  assert.equal(pending.verification_status, 'VERIFIED');
});

test('broken file fixtures are rejected before an upload', async () => {
  const { ctx, calls } = harness();
  ctx.fixture = () => ({
    type: 'application/pdf',
    name: 'bad.pdf',
    buffer: Buffer.from('not a PDF'),
  });
  await assert.rejects(seedPortal(ctx), /actual PDF fixture/);
  assert.equal(calls.filter((call) => call.method === 'UPLOAD').length, 0);
});
