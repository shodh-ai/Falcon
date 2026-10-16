'use strict';

// This fixture uses only the confirmed, dedicated synthetic tenant. Foundations
// use the existing schema; business transitions go through authenticated APIs.
const { createHash } = require('node:crypto');

const PROGRAM = 'FALCON SMOKE PROGRAM';
const SECTION = 'S';
const YEAR = '2026-2027';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function stableUuid(label) {
  const hex = createHash('sha256').update(label).digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ['8', '9', 'a', 'b'][parseInt(hex[16], 16) % 4];
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function dateAfter(date, days) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function assertSeedScope(ctx) {
  for (const key of ['tenantId', 'studentId', 'facultyId', 'deanId', 'examCellId']) {
    if (!UUID.test(ctx.ids?.[key] ?? '')) throw new Error(`Missing valid synthetic ${key}`);
  }
  if (new Set(['studentId', 'facultyId', 'deanId', 'examCellId'].map((key) => ctx.ids[key])).size !== 4) {
    throw new Error('Student, Faculty, Dean, and Exam Cell must be separate synthetic actors');
  }
  if (!Number.isInteger(ctx.ids.programId) || ctx.ids.programId < 1) throw new Error('Synthetic program ID is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ctx.seedDate ?? '') || dateAfter(ctx.seedDate, 0) !== ctx.seedDate) {
    throw new Error('A valid stable seedDate is required; do not create rolling daily duplicates');
  }
  if (ctx.academicYear !== YEAR) throw new Error('Academic year must match the existing enrollment-sync default');
}

function buildAcademicPlan(seedDate, tenantId) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(seedDate) || dateAfter(seedDate, 0) !== seedDate) throw new Error('Invalid seed date');
  const current = [
    ['SMK-PORTAL-C201', 'Smoke Test Programming Fundamentals', 4, false],
    ['SMK-PORTAL-C202', 'Smoke Test Data and Databases', 4, false],
    ['SMK-PORTAL-C203', 'Smoke Test Responsible AI', 3, true],
  ].map(([code, name, credits, elective]) => ({
    course_id: stableUuid(`${tenantId}:course:${code}`), course_code: code,
    course_name: name, credits, is_elective: elective, semester: 2,
    allocation_id: stableUuid(`${tenantId}:allocation:${code}`), allocation_semester: 'II-S',
  }));
  const historical = [
    ['SMK-PORTAL-H101', 'Smoke Test Computing Foundations', 82, 'A', 9],
    ['SMK-PORTAL-H102', 'Smoke Test Quantitative Foundations', 52, 'C', 6],
  ].map(([code, name, marks, grade, gradePoints]) => ({
    course_id: stableUuid(`${tenantId}:course:${code}`), course_code: code,
    course_name: name, credits: 4, is_elective: false, semester: 1,
    allocation_id: stableUuid(`${tenantId}:allocation:${code}`), allocation_semester: 'I-S',
    marks, grade, grade_points: gradePoints,
  }));
  const attendanceStatuses = [['PRESENT', 'ABSENT'], ['LATE', 'PRESENT'], ['EXCUSED', 'PRESENT']];
  const slots = current.flatMap((course, index) => [-1, 0].map((offset, session) => {
    const date = dateAfter(seedDate, offset);
    const day = new Date(`${date}T12:00:00.000Z`).getUTCDay() || 7;
    return { course_id: course.course_id, day_of_week: day,
      start_time: `${String(9 + index).padStart(2, '0')}:00:00`,
      end_time: `${String(9 + index).padStart(2, '0')}:50:00`,
      room: 'Smoke Academic Block - SMOKE-201', section: SECTION,
      attendance_date: date, attendance_status: attendanceStatuses[index][session] };
  }));
  const assignments = ['pending', 'submitted', 'graded'].map((state, index) => ({
    state, title: `SMOKE TEST — ${['Programming Exercise', 'Database Design Report', 'Responsible AI Reflection'][index]}`,
    description: 'Dedicated synthetic Student Portal smoke-test assignment. This is not real coursework.',
    max_marks: 20, start_date: `${dateAfter(seedDate, -1)}T00:00:00.000Z`,
    due_date: `${dateAfter(seedDate, 10 + index)}T18:00:00.000Z`, course: current[index],
  }));
  return { current, historical, slots, assignments, seedDate };
}

async function one(ctx, sql, values) {
  return (await ctx.db.query(sql, values)).rows[0] ?? null;
}

async function attempt(ctx, name, work) {
  try { return await work(); } catch (error) {
    // Do not expose request headers, tokens, file bytes, or passwords.
    const reason = String(error?.message ?? 'Existing application rejected this workflow').slice(0, 500);
    await ctx.blocked(name, reason);
    return null;
  }
}

async function seedCourse(ctx, course) {
  const subject = await ctx.ensureRow('academic_subjects', {
    subject_code: course.course_code, subject_name: course.course_name,
    subject_shortname: course.semester === 2 ? 'SMOKE CURRENT' : 'SMOKE HISTORY',
    program_id: ctx.ids.programId, semester: course.semester, credits: course.credits,
    subject_type: 'THEORY', is_active: true,
  }, { subject_code: course.course_code }, 'subjects');
  if (Number(subject.program_id) !== ctx.ids.programId) throw new Error('Synthetic subject code collides with another program');
  const savedCourse = await ctx.ensureRow('academic_courses', {
    tenant_id: ctx.ids.tenantId, course_id: course.course_id, course_code: course.course_code,
    course_name: course.course_name, credits: course.credits, is_elective: course.is_elective,
    course_type: course.is_elective ? 'ELECTIVE' : 'CORE', min_attendance: 75,
  }, { tenant_id: ctx.ids.tenantId, course_code: course.course_code }, 'courses');
  if (savedCourse.course_id !== course.course_id || savedCourse.tenant_id !== ctx.ids.tenantId) {
    throw new Error('Synthetic course code collides with another course identity');
  }
  await ctx.ensureRow('academic_course_allocations', {
    allocation_id: course.allocation_id, tenant_id: ctx.ids.tenantId, subject_id: subject.subject_id,
    course_id: course.course_id, program_name: PROGRAM, semester: course.allocation_semester,
    faculty_user_id: ctx.ids.facultyId, academic_year: YEAR, status: 'ACTIVE',
  }, { allocation_id: course.allocation_id, tenant_id: ctx.ids.tenantId }, 'course_allocations');
  return { ...course, subject_id: subject.subject_id };
}

async function ensureEnrollment(ctx, course) {
  const match = { tenant_id: ctx.ids.tenantId, student_user_id: ctx.ids.studentId, course_id: course.course_id };
  const existing = await one(ctx,
    'SELECT * FROM student_course_enrollments WHERE tenant_id=$1 AND student_user_id=$2 AND course_id=$3',
    [ctx.ids.tenantId, ctx.ids.studentId, course.course_id]);
  if (existing) {
    if (Number(existing.semester) !== course.semester || existing.section_code !== SECTION) {
      throw new Error('Existing synthetic enrollment has an incompatible semester/section; refusing to overwrite it');
    }
    await ctx.track('student_course_enrollments', existing, 'enrollments');
    return existing;
  }
  return ctx.ensureRow('student_course_enrollments', {
    ...match, semester: course.semester, section_code: SECTION, status: 'ENROLLED',
    attendance_percent: '0.00', roll_number: `SMOKE-S${course.semester}-001`,
  }, match, 'enrollments');
}

async function seedTimetable(ctx, plan) {
  const rows = (await ctx.db.query(
    'SELECT * FROM academic_timetables WHERE tenant_id=$1 AND faculty_user_id=$2 AND deleted_at IS NULL ORDER BY course_id,day_of_week,start_time',
    [ctx.ids.tenantId, ctx.ids.facultyId])).rows;
  const key = (slot) => `${slot.course_id}|${slot.day_of_week}|${String(slot.start_time).slice(0, 5)}|${String(slot.end_time).slice(0, 5)}|${slot.room}|${slot.section}`;
  if (rows.length) {
    if (rows.length !== plan.slots.length || !plan.slots.every((slot) => rows.some((row) => key(row) === key(slot)))) {
      throw new Error('Existing synthetic faculty timetable differs; refusing service that would archive existing rows');
    }
  } else {
    await ctx.request(ctx.actors.faculty, 'POST', '/api/academics/faculty/workspaces/timetable/slots', {
      slots: plan.slots.map(({ attendance_date, attendance_status, ...slot }) => slot),
    });
  }
  const saved = (await ctx.db.query(
    'SELECT * FROM academic_timetables WHERE tenant_id=$1 AND faculty_user_id=$2 AND deleted_at IS NULL',
    [ctx.ids.tenantId, ctx.ids.facultyId])).rows;
  for (const row of saved) await ctx.track('academic_timetables', row, 'timetable');
  if (saved.length !== 6) throw new Error('Expected exactly six dedicated timetable slots');
  return saved;
}

async function seedAttendance(ctx, plan, timetable) {
  for (const slot of plan.slots) {
    const scheduled = timetable.find((row) => row.course_id === slot.course_id && Number(row.day_of_week) === slot.day_of_week);
    if (!scheduled) throw new Error('A valid timetable slot is required for each attendance session');
    let record = await one(ctx,
      'SELECT * FROM course_attendance_logs WHERE tenant_id=$1 AND course_id=$2 AND faculty_user_id=$3 AND date=$4::date AND timetable_id=$5',
      [ctx.ids.tenantId, slot.course_id, ctx.ids.facultyId, slot.attendance_date, scheduled.timetable_id]);
    if (!record) {
      const age = (Date.now() - new Date(`${slot.attendance_date}T00:00:00.000Z`).getTime()) / 86400000;
      if (age > 4) throw new Error('Missing fixed-date attendance fixture is beyond the existing three-day edit window');
      await ctx.request(ctx.actors.faculty, 'POST', '/api/academics/faculty/attendance', {
        course_id: slot.course_id, timetable_id: scheduled.timetable_id, date: slot.attendance_date,
        attendance_data: [{ student_id: ctx.ids.studentId, status: slot.attendance_status }],
      });
      record = await one(ctx,
        'SELECT * FROM course_attendance_logs WHERE tenant_id=$1 AND course_id=$2 AND faculty_user_id=$3 AND date=$4::date AND timetable_id=$5',
        [ctx.ids.tenantId, slot.course_id, ctx.ids.facultyId, slot.attendance_date, scheduled.timetable_id]);
    }
    if (!record) throw new Error('Attendance API did not persist the synthetic session');
    const entries = record.attendance_data;
    if (!Array.isArray(entries) || entries.length !== 1 || entries[0].student_id !== ctx.ids.studentId || entries[0].status !== slot.attendance_status) {
      throw new Error('Synthetic attendance record differs; refusing to overwrite it');
    }
    await ctx.track('course_attendance_logs', record, 'attendance');
  }
}

async function ensureAssignment(ctx, course, spec) {
  let assignment = await one(ctx,
    'SELECT * FROM academic_assignments WHERE tenant_id=$1 AND course_id=$2 AND faculty_user_id=$3 AND title=$4 AND deleted_at IS NULL',
    [ctx.ids.tenantId, course.course_id, ctx.ids.facultyId, spec.title]);
  if (!assignment) {
    assignment = await ctx.request(ctx.actors.faculty, 'POST', '/api/academics/faculty/assignments', {
      course_id: course.course_id, title: spec.title, description: spec.description,
      max_marks: spec.max_marks, start_date: spec.start_date, due_date: spec.due_date,
      semester: 2, section_code: SECTION,
    });
  }
  if (!assignment?.assignment_id) throw new Error('Assignment API did not return a saved assignment');
  await ctx.track('academic_assignments', assignment, 'assignments');
  let submission = await one(ctx,
    'SELECT * FROM assignment_submissions WHERE tenant_id=$1 AND assignment_id=$2 AND student_user_id=$3 AND deleted_at IS NULL',
    [ctx.ids.tenantId, assignment.assignment_id, ctx.ids.studentId]);
  if (spec.state !== 'pending' && !submission) {
    submission = await ctx.upload(ctx.actors.student,
      `/api/academics/assignments/${assignment.assignment_id}/submit`, {}, await ctx.fixture('assignment'));
  }
  if (spec.state === 'graded' && submission && submission.status !== 'GRADED') {
    submission = await ctx.request(ctx.actors.faculty, 'POST', `/api/academics/faculty/submissions/${submission.submission_id}/grade`, {
      marks_awarded: 16, faculty_remarks: 'Synthetic smoke-test feedback: clear reasoning; add examples to improve.',
    });
  }
  if (submission) await ctx.track('assignment_submissions', submission, 'assignment_submissions');
  await ctx.check(`Assignment ${spec.state} fixture`, spec.state === 'pending' ? !submission :
    spec.state === 'graded' ? submission?.status === 'GRADED' && Number(submission.marks_awarded) === 16 : submission?.status === 'SUBMITTED',
    { assignment_id: assignment.assignment_id, actual_status: submission?.status ?? 'PENDING' });
  return { assignment, submission };
}

async function ensureMark(ctx, course, examType, marks, maximum, publish) {
  let mark = await one(ctx,
    'SELECT * FROM academic_marks WHERE tenant_id=$1 AND student_user_id=$2 AND course_id=$3 AND exam_type=$4',
    [ctx.ids.tenantId, ctx.ids.studentId, course.course_id, examType]);
  if (!mark) {
    await ctx.request(ctx.actors.faculty, 'POST', '/api/academics/faculty/workspaces/marks/draft', {
      course_id: course.course_id, exam_type: examType, max_marks: maximum,
      entries: [{ student_user_id: ctx.ids.studentId, marks_obtained: marks }],
    });
    mark = await one(ctx,
      'SELECT * FROM academic_marks WHERE tenant_id=$1 AND student_user_id=$2 AND course_id=$3 AND exam_type=$4',
      [ctx.ids.tenantId, ctx.ids.studentId, course.course_id, examType]);
  }
  if (!mark || Number(mark.marks_obtained) !== marks || Number(mark.max_marks) !== maximum) throw new Error('Synthetic marks differ; refusing to overwrite them');
  if (publish && mark.status === 'DRAFT') {
    await ctx.request(ctx.actors.faculty, 'POST', '/api/academics/faculty/workspaces/marks/publish', { course_id: course.course_id, exam_type: examType });
    mark = await one(ctx,
      'SELECT * FROM academic_marks WHERE tenant_id=$1 AND student_user_id=$2 AND course_id=$3 AND exam_type=$4',
      [ctx.ids.tenantId, ctx.ids.studentId, course.course_id, examType]);
  }
  await ctx.track('academic_marks', mark, 'marks');
  return mark;
}

async function ensureHistoricalResult(ctx, course) {
  let session = await one(ctx,
    "SELECT * FROM exam_result_sessions WHERE tenant_id=$1 AND course_id=$2 AND exam_type='END_TERM' AND semester=1",
    [ctx.ids.tenantId, course.course_id]);
  if (session?.declared_at) {
    await ctx.track('exam_result_sessions', session, 'result_sessions');
    return session;
  }
  // Historical active enrollments are temporary until legitimate declaration.
  // No Student bootstrap is called during this transition.
  await ensureEnrollment(ctx, course);
  if (!session) session = await ctx.request(ctx.actors.examCell, 'POST', '/api/exam-cell/result-control/sessions', {
    course_id: course.course_id, exam_type: 'END_TERM', semester: 1, max_marks: 100, pass_marks: 40,
  });
  if (!session?.session_id) throw new Error('Result session API did not return session_id');
  const base = `/api/exam-cell/result-control/sessions/${session.session_id}`;
  let mark = await one(ctx,
    "SELECT * FROM academic_marks WHERE tenant_id=$1 AND student_user_id=$2 AND course_id=$3 AND exam_type='END_TERM'",
    [ctx.ids.tenantId, ctx.ids.studentId, course.course_id]);
  if (!mark || mark.status === 'DRAFT') {
    if (session.entry_status !== 'OPEN' || session.marks_locked) await ctx.request(ctx.actors.examCell, 'POST', `${base}/open-entry`, {});
    mark = await ensureMark(ctx, course, 'END_TERM', course.marks, 100, true);
  }
  if (mark.status !== 'PENDING_COE') throw new Error('Historical marks must be submitted to Exam Cell, not manually published');
  if (session.entry_status !== 'LOCKED' || !session.marks_locked) await ctx.request(ctx.actors.examCell, 'POST', `${base}/prepare-declaration`, {});
  const previousAudit = await one(ctx,
    "SELECT action FROM exam_audit_logs WHERE tenant_id=$1 AND resource_id=$2 AND action IN ('RESULT_COE_AUDIT_PASSED','RESULT_COE_AUDIT_ANOMALY') ORDER BY created_at DESC LIMIT 1",
    [ctx.ids.tenantId, session.session_id]);
  const auditStatus = previousAudit ? previousAudit.action === 'RESULT_COE_AUDIT_PASSED' ? 'passed' : 'anomaly' :
    (await ctx.request(ctx.actors.examCell, 'POST', `${base}/formula-audit`, {})).status;
  if (auditStatus !== 'passed') throw new Error('Existing COE formula audit did not pass; no approval or publication performed');
  let approval = await one(ctx,
    "SELECT * FROM exam_result_dean_approval_requests WHERE tenant_id=$1 AND session_id=$2 AND status IN ('PENDING','APPROVED') ORDER BY requested_at DESC LIMIT 1",
    [ctx.ids.tenantId, session.session_id]);
  if (!approval) approval = await ctx.request(ctx.actors.examCell, 'POST', `${base}/dean-approval`, {});
  if (approval.status !== 'APPROVED') {
    await ctx.request(ctx.actors.dean, 'POST', `/api/academics/dean/intelligence/result-approvals/${approval.request_id}/decision`, {
      decision: 'APPROVED', comment: 'Approved dedicated synthetic smoke-test result after COE formula audit.',
    });
  }
  // Verify the actual approval before invoking the application's declaration.
  const approved = await one(ctx,
    "SELECT * FROM exam_result_dean_approval_requests WHERE tenant_id=$1 AND session_id=$2 AND status='APPROVED' LIMIT 1",
    [ctx.ids.tenantId, session.session_id]);
  if (!approved) throw new Error('Dean API did not persist approval; refusing declaration');
  await ctx.track('exam_result_dean_approval_requests', approved, 'result_approvals');
  if (!session.processed_at) await ctx.request(ctx.actors.examCell, 'POST', `${base}/process`, {});
  await ctx.request(ctx.actors.examCell, 'POST', `${base}/declare`, { declaration_note: 'Dedicated synthetic Student Portal smoke-test result.' });
  session = await one(ctx, 'SELECT * FROM exam_result_sessions WHERE tenant_id=$1 AND session_id=$2', [ctx.ids.tenantId, session.session_id]);
  if (!session?.declared_at) throw new Error('Result declaration was not persisted');
  await ctx.track('exam_result_sessions', session, 'result_sessions');
  return session;
}

async function seedAcademics(ctx) {
  assertSeedScope(ctx);
  const plan = buildAcademicPlan(ctx.seedDate, ctx.ids.tenantId);
  plan.current = await Promise.all(plan.current.map((course) => seedCourse(ctx, course)));
  // Persist foundations before giving the other fixture stages course IDs.
  ctx.academic = { currentCourses: plan.current, historicalCourses: [], assignments: [], plan };
  ctx.ids.courses = plan.current;
  for (const course of plan.current) await ensureEnrollment(ctx, course);
  const unfinishedHistory = await one(ctx,
    "SELECT COUNT(*)::int AS count FROM student_course_enrollments WHERE tenant_id=$1 AND student_user_id=$2 AND semester<>2 AND status='ENROLLED' AND deleted_at IS NULL",
    [ctx.ids.tenantId, ctx.ids.studentId]);
  if (Number(unfinishedHistory?.count || 0) > 0) {
    for (const spec of plan.historical) {
      const course = await seedCourse(ctx, spec);
      await ensureHistoricalResult(ctx, course);
    }
    const pending = await one(ctx,
      "SELECT COUNT(*)::int AS count FROM student_course_enrollments WHERE tenant_id=$1 AND student_user_id=$2 AND semester<>2 AND status='ENROLLED' AND deleted_at IS NULL",
      [ctx.ids.tenantId, ctx.ids.studentId]);
    if (Number(pending?.count || 0) > 0) throw new Error('Historical workflow did not complete; refusing SIS synchronization that could delete existing rows.');
  }
  // Reconcile through the existing SIS service before the learning-module
  // acceptance/activation hook. A failed hook stops here, before LMS writes.
  await ctx.request(ctx.actors.student, 'POST', '/api/student/portal-bootstrap', {});
  const reconciled = (await ctx.db.query(
    'SELECT * FROM student_course_enrollments WHERE tenant_id=$1 AND student_user_id=$2 AND semester=2 AND status=\'ENROLLED\' AND deleted_at IS NULL',
    [ctx.ids.tenantId, ctx.ids.studentId])).rows;
  if (reconciled.length !== 3 || !plan.current.every((course) => reconciled.some((row) => row.course_id === course.course_id && row.section_code === SECTION))) {
    throw new Error('SIS registration synchronization did not retain exactly the dedicated current courses');
  }
  if (typeof ctx.beforeLearning === 'function') await ctx.beforeLearning(ctx);
  await ctx.ensureRow('campus_spaces', {
    tenant_id: ctx.ids.tenantId, building_name: 'Smoke Academic Block', room_number: 'SMOKE-201',
    space_type: 'CLASSROOM', capacity: 30, facilities: { smoke_test: true, projector: true }, status: 'AVAILABLE',
  }, { tenant_id: ctx.ids.tenantId, building_name: 'Smoke Academic Block', room_number: 'SMOKE-201' }, 'classrooms');
  const timetable = await attempt(ctx, 'Academic timetable', () => seedTimetable(ctx, plan));
  if (timetable) await attempt(ctx, 'Academic attendance', () => seedAttendance(ctx, plan, timetable));
  for (const spec of plan.assignments) {
    const course = plan.current.find((row) => row.course_id === spec.course.course_id);
    const result = await attempt(ctx, `Assignment ${spec.state}`, () => ensureAssignment(ctx, course, spec));
    if (result) ctx.academic.assignments.push(result);
  }
  await attempt(ctx, 'Published quiz marks', () => ensureMark(ctx, plan.current[0], 'QUIZ', 8, 10, true));
  await attempt(ctx, 'Unpublished lower marks', () => ensureMark(ctx, plan.current[1], 'GA1', 2, 5, false));
  for (const [index, course] of plan.current.entries()) {
    await attempt(ctx, `Scheduled examination ${course.course_code}`, async () => {
      let schedule = await one(ctx,
        "SELECT * FROM exam_schedules WHERE tenant_id=$1 AND subject_id=$2 AND exam_type='MID_TERM' AND batch_label=$3 AND deleted_at IS NULL",
        [ctx.ids.tenantId, course.subject_id, `${PROGRAM} II-S SMOKE`]);
      if (!schedule) {
        const body = await ctx.request(ctx.actors.examCell, 'POST', '/api/exam-cell/schedules', {
          subject_id: course.subject_id, exam_type: 'MID_TERM', exam_date: dateAfter(ctx.seedDate, 14 + index),
          start_time: '09:00:00', end_time: '11:00:00', venue: 'Smoke Academic Block - SMOKE-201',
          max_marks: 100, batch_label: `${PROGRAM} II-S SMOKE`,
        });
        schedule = Array.isArray(body) ? body[0] : body;
      }
      if (!schedule?.exam_schedule_id) throw new Error('Exam schedule was not saved');
      await ctx.track('exam_schedules', schedule, 'exam_schedules');
    });
  }
  for (const historical of plan.historical) {
    const course = await seedCourse(ctx, historical);
    ctx.academic.historicalCourses.push(course);
    await attempt(ctx, `Approved historical result ${course.course_code}`, () => ensureHistoricalResult(ctx, course));
  }
  // Grade-card operations are tenant+semester-wide, so prove the roster is only
  // this dedicated Student before calling them. Never fabricate a published card.
  await attempt(ctx, 'Published semester grade card', async () => {
    const progress = (await ctx.db.query(
      'SELECT * FROM student_course_enrollments WHERE tenant_id=$1 AND semester=1 AND deleted_at IS NULL', [ctx.ids.tenantId])).rows;
    if (progress.length !== 2 || progress.some((row) => row.student_user_id !== ctx.ids.studentId || row.status !== 'COMPLETED')) {
      throw new Error('Both legitimate historical results must be completed before generating a grade card');
    }
    let card = await one(ctx, 'SELECT * FROM grade_cards WHERE tenant_id=$1 AND student_user_id=$2 AND semester=1', [ctx.ids.tenantId, ctx.ids.studentId]);
    if (!card) {
      await ctx.request(ctx.actors.examCell, 'POST', '/api/exam-cell/grade-cards/generate', { semester: 1 });
      card = await one(ctx, 'SELECT * FROM grade_cards WHERE tenant_id=$1 AND student_user_id=$2 AND semester=1', [ctx.ids.tenantId, ctx.ids.studentId]);
    }
    if (!card) throw new Error('Grade card was not generated');
    if (card.status === 'DRAFT') {
      await ctx.request(ctx.actors.examCell, 'POST', '/api/exam-cell/grade-cards/publish-provisional', { semester: 1 });
      card = await one(ctx, 'SELECT * FROM grade_cards WHERE tenant_id=$1 AND student_user_id=$2 AND semester=1', [ctx.ids.tenantId, ctx.ids.studentId]);
    }
    await ctx.track('grade_cards', card, 'grade_cards');
    await ctx.check('Published historical SGPA and CGPA', card.status === 'PUBLISHED' && Number(card.cgpa) === 7.5 && Number(card.payload.sgpa) === 7.5,
      { grade_card_id: card.grade_card_id, cgpa: Number(card.cgpa), sgpa: Number(card.payload.sgpa) });
  });
  return ctx.academic;
}

async function verifyAcademics(ctx) {
  assertSeedScope(ctx);
  const courses = ctx.academic?.currentCourses ?? ctx.ids.courses ?? [];
  const enrollments = (await ctx.db.query(
    'SELECT * FROM student_course_enrollments WHERE tenant_id=$1 AND student_user_id=$2 AND deleted_at IS NULL', [ctx.ids.tenantId, ctx.ids.studentId])).rows;
  await ctx.check('Current synthetic enrollments', courses.length === 3 && courses.every((course) => enrollments.some((row) => row.course_id === course.course_id && row.status === 'ENROLLED' && Number(row.semester) === 2 && row.section_code === SECTION)), { expected: 3 });
  const statistics = (await ctx.db.query(
    `SELECT e.course_id,e.attendance_percent,COUNT(entry.value)::int AS sessions,
      COALESCE(SUM(CASE WHEN entry.value->>'status' IN ('PRESENT','LATE','EXCUSED') THEN 1 ELSE 0 END),0)::int AS credited
     FROM student_course_enrollments e
     LEFT JOIN course_attendance_logs a ON a.tenant_id=e.tenant_id AND a.course_id=e.course_id AND a.deleted_at IS NULL
     LEFT JOIN LATERAL jsonb_array_elements(a.attendance_data) entry(value) ON entry.value->>'student_id'=e.student_user_id::text
     WHERE e.tenant_id=$1 AND e.student_user_id=$2 AND e.semester=2 AND e.deleted_at IS NULL
     GROUP BY e.course_id,e.attendance_percent`, [ctx.ids.tenantId, ctx.ids.studentId])).rows;
  await ctx.check('Attendance cache reconciles with session records', statistics.length === 3 && statistics.every((row) => row.sessions === 2 && Math.abs(Number(row.attendance_percent) - Math.round(row.credited / row.sessions * 10000) / 100) < 0.01),
    { courses: statistics.map((row) => ({ course_id: row.course_id, sessions: row.sessions, attendance_percent: Number(row.attendance_percent) })) });
  const reports = (await ctx.db.query(
    'SELECT * FROM student_exam_reports WHERE tenant_id=$1 AND student_user_id=$2', [ctx.ids.tenantId, ctx.ids.studentId])).rows;
  for (const report of reports) await ctx.track('student_exam_reports', report, 'published_results');
  const expectedHistory = ctx.academic?.historicalCourses ?? buildAcademicPlan(ctx.seedDate, ctx.ids.tenantId).historical;
  await ctx.check('Approved historical results', reports.length === 2 && expectedHistory.every((expected) => reports.some((row) =>
    row.course_id === expected.course_id && row.result_status === 'PASS' && Number(row.marks_obtained) === expected.marks &&
    Number(row.max_marks) === 100 && row.grade === expected.grade && Number(row.grade_points) === expected.grade_points &&
    Number(row.percent) === expected.marks)), { expected: 2, actual: reports.length });
  const publishedQuiz = await one(ctx, "SELECT * FROM academic_marks WHERE tenant_id=$1 AND student_user_id=$2 AND exam_type='QUIZ'", [ctx.ids.tenantId, ctx.ids.studentId]);
  await ctx.check('Faculty-direct quiz publication', publishedQuiz?.status === 'PUBLISHED' && Number(publishedQuiz.marks_obtained) === 8 && Number(publishedQuiz.max_marks) === 10,
    { exam_type: 'QUIZ', status: publishedQuiz?.status ?? 'MISSING' });
  const mark = await one(ctx, "SELECT * FROM academic_marks WHERE tenant_id=$1 AND student_user_id=$2 AND exam_type='GA1'", [ctx.ids.tenantId, ctx.ids.studentId]);
  await ctx.check('Unpublished component remains draft', mark?.status === 'DRAFT' && Number(mark.marks_obtained) === 2, { exam_type: 'GA1', status: mark?.status ?? 'MISSING' });
}

module.exports = { seedAcademics, verifyAcademics, buildAcademicPlan, assertSeedScope, ensureAssignment, ensureHistoricalResult, stableUuid };
