'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { seedAcademics, buildAcademicPlan, assertSeedScope, ensureAssignment, ensureHistoricalResult, stableUuid } = require('./academics.cjs');

const ids = {
  tenantId: 'b1000000-0000-4000-8000-000000000001',
  studentId: 'b1000000-0000-4000-8000-000000000002',
  facultyId: 'b1000000-0000-4000-8000-000000000003',
  deanId: 'b1000000-0000-4000-8000-000000000004',
  examCellId: 'b1000000-0000-4000-8000-000000000005', programId: 101,
};
const actors = { student: 'student-token', faculty: 'faculty-token', dean: 'dean-token', examCell: 'exam-token' };
const plan = () => buildAcademicPlan('2026-10-14', ids.tenantId);

test('academic plan uses existing program, Roman allocation semesters and supported attendance statuses', () => {
  const data = plan();
  assert.equal(data.current.length, 3);
  assert.equal(data.historical.length, 2);
  assert.ok(data.current.every((row) => row.semester === 2 && row.allocation_semester === 'II-S'));
  assert.ok(data.historical.every((row) => row.semester === 1 && row.allocation_semester === 'I-S'));
  assert.deepEqual(new Set(data.slots.map((row) => row.attendance_status)), new Set(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']));
  assert.ok(data.current.every((row) => row.course_code.length <= 30 && row.credits > 0));
});

test('stable IDs and fixed dates make repeated plans identical, with no overlapping classes', () => {
  const first = plan();
  assert.deepEqual(first, plan());
  assert.notEqual(stableUuid('tenant-a:course:x'), stableUuid('tenant-b:course:x'));
  assert.match(stableUuid('x'), /^[0-9a-f-]{14}5[0-9a-f-]+$/);
  assert.equal(first.slots.length, 6);
  assert.ok(first.slots.every((row) => row.day_of_week >= 1 && row.day_of_week <= 7 && row.start_time < row.end_time));
  for (const [index, left] of first.slots.entries()) {
    for (const right of first.slots.slice(index + 1)) {
      assert.ok(left.day_of_week !== right.day_of_week || left.end_time <= right.start_time || right.end_time <= left.start_time);
    }
  }
  assert.deepEqual(new Set(first.slots.map((row) => row.attendance_date)), new Set(['2026-10-13', '2026-10-14']));
  assert.ok(first.assignments.every((row) => row.start_date < row.due_date));
  assert.deepEqual(first.assignments.map((row) => row.state), ['pending', 'submitted', 'graded']);
});

test('historical pass grades and credit-weighted SGPA are internally consistent', () => {
  const history = plan().historical;
  assert.deepEqual(history.map((row) => [row.marks, row.grade, row.grade_points]), [[82, 'A', 9], [52, 'C', 6]]);
  const totalCredits = history.reduce((sum, row) => sum + row.credits, 0);
  const sgpa = history.reduce((sum, row) => sum + row.credits * row.grade_points, 0) / totalCredits;
  assert.equal(totalCredits, 8);
  assert.equal(sgpa, 7.5);
});

test('scope rejects absent identifiers, shared actor IDs, mismatched year and rolling/invalid dates', () => {
  const valid = { ids: { ...ids }, academicYear: '2026-2027', seedDate: '2026-10-14' };
  assert.doesNotThrow(() => assertSeedScope(valid));
  assert.throws(() => assertSeedScope({ ...valid, ids: { ...ids, tenantId: null } }), /tenantId/);
  assert.throws(() => assertSeedScope({ ...valid, ids: { ...ids, facultyId: ids.studentId } }), /separate/);
  assert.throws(() => assertSeedScope({ ...valid, academicYear: '2025-2026' }), /year/);
  assert.throws(() => assertSeedScope({ ...valid, seedDate: '2026-02-30' }), /seedDate/);
});

test('learning hook runs after current academic foundations and SIS synchronization, and a rejected hook prevents learning writes', async () => {
  const events = [];
  const enrollments = [];
  const stop = new Error('Acceptance is not ready');
  const ctx = {
    ids: { ...ids }, actors, seedDate: '2026-10-14', academicYear: '2026-2027',
    ensureRow: async (table, values) => {
      events.push(table);
      if (table === 'academic_subjects') return { ...values, subject_id: events.length };
      if (table === 'student_course_enrollments') enrollments.push(values);
      return values;
    },
    db: { query: async (sql) => {
      assert.ok(sql.includes('FROM student_course_enrollments'));
      return { rows: sql.includes('course_id=$3') ? [] : enrollments };
    } },
    request: async (actor, method, path) => {
      assert.equal(actor, actors.student);
      assert.equal(method, 'POST');
      assert.equal(path, '/api/student/portal-bootstrap');
      events.push('SIS synchronization');
      return { synced: true };
    },
    beforeLearning: async (passedContext) => {
      assert.equal(passedContext, ctx);
      assert.equal(ctx.academic.currentCourses.length, 3);
      assert.equal(ctx.ids.courses.length, 3);
      assert.equal(enrollments.length, 3);
      assert.equal(events.filter((event) => event === 'academic_course_allocations').length, 3);
      assert.equal(events.at(-1), 'SIS synchronization');
      events.push('learning hook');
      throw stop;
    },
  };
  await assert.rejects(seedAcademics(ctx), (error) => error === stop);
  assert.equal(events.at(-1), 'learning hook');
  assert.ok(!events.includes('campus_spaces') && !events.includes('academic_assignments'));
});

function assignmentContext(initialAssignment, initialSubmission) {
  let assignment = initialAssignment;
  let submission = initialSubmission;
  const calls = [];
  const checks = [];
  return {
    ids, actors, calls, checks,
    db: { query: async (sql, values) => {
      assert.equal(values[0], ids.tenantId);
      if (sql.includes('FROM academic_assignments')) return { rows: assignment ? [assignment] : [] };
      if (sql.includes('FROM assignment_submissions')) { assert.equal(values[2], ids.studentId); return { rows: submission ? [submission] : [] }; }
      throw new Error(`Unexpected SQL ${sql}`);
    } },
    track: async () => {}, check: async (name, pass) => checks.push({ name, pass }),
    fixture: async () => ({ name: 'smoke.pdf', type: 'application/pdf', buffer: Buffer.from('%PDF-fixture') }),
    request: async (actor, method, path, body) => {
      calls.push({ actor, method, path, body });
      assert.equal(actor, actors.faculty);
      if (path.endsWith('/assignments')) { assignment = { ...body, assignment_id: 'assignment-1' }; return assignment; }
      if (path.endsWith('/grade')) { submission = { ...submission, ...body, status: 'GRADED' }; return submission; }
      throw new Error('Unexpected API');
    },
    upload: async (actor, path, fields, file) => {
      calls.push({ actor, path, fields, file }); assert.equal(actor, actors.student);
      assert.equal(file.type, 'application/pdf');
      submission = { submission_id: 'submission-1', assignment_id: 'assignment-1', student_user_id: ids.studentId, status: 'SUBMITTED', file_path: 'actual-fixture-path' };
      return submission;
    },
  };
}

test('graded assignment uses Faculty create, real Student PDF upload, then Faculty grading', async () => {
  const ctx = assignmentContext(null, null);
  const spec = plan().assignments[2];
  const result = await ensureAssignment(ctx, spec.course, spec);
  assert.equal(result.submission.status, 'GRADED');
  assert.deepEqual(ctx.calls.map((row) => row.actor), [actors.faculty, actors.student, actors.faculty]);
  assert.equal(ctx.calls[2].body.marks_awarded, 16);
  assert.ok(ctx.checks.every((row) => row.pass));
});

test('rerun preserves a graded submission and does not resubmit or reset awarded marks', async () => {
  const ctx = assignmentContext({ assignment_id: 'existing-assignment' }, {
    submission_id: 'existing-submission', status: 'GRADED', marks_awarded: '16.00', file_path: 'saved.pdf',
  });
  const spec = plan().assignments[2];
  await ensureAssignment(ctx, spec.course, spec);
  assert.equal(ctx.calls.length, 0);
  assert.ok(ctx.checks.every((row) => row.pass));
});

test('pending and already-submitted assignments do not create duplicate uploads', async () => {
  const pending = assignmentContext({ assignment_id: 'pending-assignment' }, null);
  const submitted = assignmentContext({ assignment_id: 'submitted-assignment' }, { submission_id: 'saved', status: 'SUBMITTED' });
  await ensureAssignment(pending, plan().current[0], plan().assignments[0]);
  await ensureAssignment(submitted, plan().current[1], plan().assignments[1]);
  assert.equal(pending.calls.length + submitted.calls.length, 0);
  assert.ok([...pending.checks, ...submitted.checks].every((row) => row.pass));
});

function historicalContext({ declared = false, auditPass = true, persistApproval = true, existingAudit = null, processed = false } = {}) {
  let session = { session_id: 'session-1', entry_status: 'LOCKED', marks_locked: true, declared_at: declared ? new Date().toISOString() : null, processed_at: processed ? new Date().toISOString() : null };
  const course = plan().historical[0];
  const mark = { status: 'PENDING_COE', marks_obtained: course.marks, max_marks: 100 };
  let approved = false;
  const calls = [];
  return {
    ids, actors, calls, course,
    db: { query: async (sql, values) => {
      assert.equal(values[0], ids.tenantId);
      if (sql.includes('FROM exam_result_sessions')) return { rows: [session] };
      if (sql.includes('FROM student_course_enrollments')) return { rows: [{ semester: 1, section_code: 'S', status: 'ENROLLED' }] };
      if (sql.includes('FROM academic_marks')) return { rows: [mark] };
      if (sql.includes('FROM exam_audit_logs')) return { rows: existingAudit ? [{ action: existingAudit }] : [] };
      if (sql.includes('FROM exam_result_dean_approval_requests')) return { rows: approved && persistApproval ? [{ request_id: 'approval-1', status: 'APPROVED' }] : [] };
      throw new Error(`Unexpected SQL ${sql}`);
    } }, track: async () => {},
    request: async (actor, method, path, body) => {
      calls.push({ actor, method, path, body });
      if (path.endsWith('/formula-audit')) return { status: auditPass ? 'passed' : 'anomaly' };
      if (path.endsWith('/dean-approval')) return { request_id: 'approval-1', status: 'PENDING' };
      if (path.endsWith('/decision')) { assert.equal(actor, actors.dean); approved = true; return { status: 'APPROVED' }; }
      if (path.endsWith('/declare')) session = { ...session, declared_at: new Date().toISOString() };
      return {};
    },
  };
}

test('already declared historical result is read-only and never republishes', async () => {
  const ctx = historicalContext({ declared: true });
  const result = await ensureHistoricalResult(ctx, ctx.course);
  assert.ok(result.declared_at);
  assert.equal(ctx.calls.length, 0);
});

test('existing COE anomaly blocks Dean approval and result publication', async () => {
  const ctx = historicalContext({ auditPass: false });
  await assert.rejects(ensureHistoricalResult(ctx, ctx.course), /audit did not pass/);
  assert.deepEqual(ctx.calls.map((row) => row.path.split('/').at(-1)), ['formula-audit']);
});

test('result publication follows actual audit, Dean decision, persisted approval and declaration', async () => {
  const ctx = historicalContext();
  const result = await ensureHistoricalResult(ctx, ctx.course);
  assert.ok(result.declared_at);
  assert.deepEqual(ctx.calls.map((row) => row.path.split('/').at(-1)), ['formula-audit', 'dean-approval', 'decision', 'process', 'declare']);
  assert.deepEqual(ctx.calls.map((row) => row.actor), [actors.examCell, actors.examCell, actors.dean, actors.examCell, actors.examCell]);
});

test('a Dean HTTP response without stored approval never triggers declaration', async () => {
  const ctx = historicalContext({ persistApproval: false });
  await assert.rejects(ensureHistoricalResult(ctx, ctx.course), /did not persist approval/);
  assert.ok(!ctx.calls.some((row) => row.path.endsWith('/declare') || row.path.endsWith('/process')));
});

test('partial rerun reuses successful persisted audit and process instead of duplicating them', async () => {
  const ctx = historicalContext({ existingAudit: 'RESULT_COE_AUDIT_PASSED', processed: true });
  await ensureHistoricalResult(ctx, ctx.course);
  assert.deepEqual(ctx.calls.map((row) => row.path.split('/').at(-1)), ['dean-approval', 'decision', 'declare']);
});

test('persisted COE anomaly is not re-audited or bypassed by a seed rerun', async () => {
  const ctx = historicalContext({ existingAudit: 'RESULT_COE_AUDIT_ANOMALY' });
  await assert.rejects(ensureHistoricalResult(ctx, ctx.course), /audit did not pass/);
  assert.equal(ctx.calls.length, 0);
});
