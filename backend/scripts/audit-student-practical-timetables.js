/**
 * Read-only, cohort-wide timetable audit. Run after `npm run build`:
 *   node scripts/audit-student-practical-timetables.js
 * Optional: FALCON_AUDIT_TENANT=sgvu FALCON_AUDIT_YEAR=2026-2027
 *
 * Emits one JSON summary and one JSON line per affected student. No passwords
 * or other sensitive profile fields are queried or printed. Exits 2 when
 * unassigned practicals or genuine timetable overlaps remain.
 */
const { Client } = require('pg');
const {
  selectStudentTimetableRows,
  countStudentTimetableConflicts,
} = require('../dist/modules/academics/student-timetable-visibility');

const tenant = process.env.FALCON_AUDIT_TENANT || 'sgvu';
const academicYear = process.env.FALCON_AUDIT_YEAR || '2026-2027';
const client = new Client(process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USERNAME || process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_DATABASE || 'university_governance',
    });

async function run() {
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const { rows: students } = await client.query(
      `SELECT sp.user_id, sp.student_login_id, sp.program_name, sp.current_semester, sp.tenant_id
       FROM student_profiles sp
       JOIN users u ON u.user_id = sp.user_id AND u.tenant_id = sp.tenant_id
       JOIN tenants t ON t.tenant_id = sp.tenant_id
       WHERE t.subdomain = $1 AND sp.status = 'ACTIVE'
         AND sp.deleted_at IS NULL AND u.deleted_at IS NULL AND u.is_active = true
         AND sp.current_semester = 1
         AND sp.program_name IN ('B.Pharm', 'D.Pharm', 'M.Pharm Pharmaceutics')
       ORDER BY sp.program_name, sp.student_login_id, sp.user_id`,
      [tenant],
    );
    const ids = students.map((student) => student.user_id);
    if (ids.length === 0) {
      console.log(JSON.stringify({ tenant, students_examined: 0, warning: 'No active Pharmacy students found' }));
      process.exitCode = 2;
      return;
    }
    const { rows: [schema] } = await client.query(
      `SELECT to_regclass('public.academic_practical_batches') AS batches,
              to_regclass('public.academic_practical_batch_members') AS members`,
    );
    if (!schema.batches || !schema.members) {
      throw new Error('Practical batch roster migration 20261012150000 has not been applied');
    }
    const { rows: enrollments } = await client.query(
      `SELECT e.student_user_id, e.course_id, e.section_code
       FROM student_course_enrollments e
       JOIN student_profiles sp ON sp.user_id = e.student_user_id
       WHERE e.student_user_id = ANY($1::uuid[])
         AND e.status = 'ENROLLED' AND e.deleted_at IS NULL
         AND (sp.current_semester IS NULL OR e.semester = sp.current_semester)`,
      [ids],
    );
    const { rows: allocations } = await client.query(
      `SELECT DISTINCT program_name, course_id
       FROM academic_course_allocations
       WHERE tenant_id = $1 AND academic_year = $2 AND semester = 'I'
         AND status = 'ACTIVE' AND course_id IS NOT NULL
         AND program_name IN ('B.Pharm', 'D.Pharm', 'M.Pharm Pharmaceutics')`,
      [students[0].tenant_id, academicYear],
    );
    const expectedByProgram = new Map();
    for (const allocation of allocations) {
      const courseIds = expectedByProgram.get(allocation.program_name) || new Set();
      courseIds.add(allocation.course_id);
      expectedByProgram.set(allocation.program_name, courseIds);
    }
    if (students.some((student) => !expectedByProgram.get(student.program_name)?.size)) {
      throw new Error(`Active Semester-I course allocations missing for ${academicYear}`);
    }
    const courseIds = [...new Set(enrollments.map((enrollment) => enrollment.course_id))];
    const { rows: slots } = courseIds.length
      ? await client.query(
        `SELECT tt.course_id, tt.section, tt.day_of_week, tt.start_time, tt.end_time,
                c.course_code, c.course_name
         FROM academic_timetables tt
         JOIN academic_courses c ON c.course_id = tt.course_id AND c.tenant_id = tt.tenant_id
         WHERE tt.tenant_id = $1 AND tt.course_id = ANY($2::uuid[])
           AND tt.deleted_at IS NULL AND c.deleted_at IS NULL`,
        [students[0].tenant_id, courseIds],
      )
      : { rows: [] };
    const { rows: memberships } = courseIds.length
      ? await client.query(
        `SELECT m.student_user_id, m.course_id, b.section_code
         FROM academic_practical_batch_members m
         JOIN academic_practical_batches b
           ON b.batch_id = m.batch_id AND b.tenant_id = m.tenant_id
         WHERE m.tenant_id = $1 AND m.student_user_id = ANY($2::uuid[])
           AND m.removed_at IS NULL`,
        [students[0].tenant_id, ids],
      )
      : { rows: [] };

    const enrolledByStudent = new Map();
    for (const enrollment of enrollments) {
      const rows = enrolledByStudent.get(enrollment.student_user_id) || [];
      rows.push(enrollment);
      enrolledByStudent.set(enrollment.student_user_id, rows);
    }
    const batchByStudent = new Map();
    for (const member of memberships) {
      const map = batchByStudent.get(member.student_user_id) || new Map();
      map.set(member.course_id, member.section_code);
      batchByStudent.set(member.student_user_id, map);
    }
    const slotsByCourse = new Map();
    for (const slot of slots) {
      const rows = slotsByCourse.get(slot.course_id) || [];
      rows.push({
        ...slot,
        course: { course_code: slot.course_code, course_name: slot.course_name },
      });
      slotsByCourse.set(slot.course_id, rows);
    }

    const summary = {
      tenant,
      academic_year: academicYear,
      students_examined: students.length,
      no_current_enrollment_students: 0,
      incorrect_course_mapping_students: 0,
      missing_course_enrollments: 0,
      unexpected_course_enrollments: 0,
      unassigned_practical_students: 0,
      unassigned_practical_courses: 0,
      confirmed_overlap_students: 0,
      confirmed_overlap_pairs: 0,
    };
    for (const student of students) {
      const enrolled = enrolledByStudent.get(student.user_id) || [];
      const actualCourseIds = new Set(enrolled.map((row) => row.course_id));
      const expectedCourseIds = expectedByProgram.get(student.program_name);
      const missingCourseIds = [...expectedCourseIds].filter((id) => !actualCourseIds.has(id));
      const unexpectedCourseIds = [...actualCourseIds].filter((id) => !expectedCourseIds.has(id));
      const sections = new Map(enrolled.map((row) => [row.course_id, row.section_code]));
      const studentSlots = enrolled.flatMap((row) => slotsByCourse.get(row.course_id) || []);
      const { rows, pendingPracticalBatches } = selectStudentTimetableRows(
        studentSlots,
        batchByStudent.get(student.user_id) || new Map(),
        sections,
      );
      const conflicts = countStudentTimetableConflicts(rows);
      if (!enrolled.length) summary.no_current_enrollment_students += 1;
      if (missingCourseIds.length || unexpectedCourseIds.length) summary.incorrect_course_mapping_students += 1;
      summary.missing_course_enrollments += missingCourseIds.length;
      summary.unexpected_course_enrollments += unexpectedCourseIds.length;
      if (pendingPracticalBatches.length) summary.unassigned_practical_students += 1;
      summary.unassigned_practical_courses += pendingPracticalBatches.length;
      if (conflicts) summary.confirmed_overlap_students += 1;
      summary.confirmed_overlap_pairs += conflicts;
      if (!enrolled.length || missingCourseIds.length || unexpectedCourseIds.length
        || pendingPracticalBatches.length || conflicts) {
        console.log(JSON.stringify({
          student_login_id: student.student_login_id || student.user_id,
          program: student.program_name,
          semester: student.current_semester,
          no_current_enrollment: !enrolled.length,
          missing_course_enrollments: missingCourseIds.length,
          unexpected_course_enrollments: unexpectedCourseIds.length,
          pending_batch_courses: pendingPracticalBatches.map((course) => course.course_code),
          confirmed_overlap_pairs: conflicts,
        }));
      }
    }
    console.log(JSON.stringify({ summary }));
    if (summary.no_current_enrollment_students || summary.incorrect_course_mapping_students
      || summary.unassigned_practical_students
      || summary.confirmed_overlap_students) process.exitCode = 2;
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error('Student timetable audit failed:', error.message);
  process.exitCode = 1;
});
