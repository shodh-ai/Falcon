const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  allocationMatchesStudentSlot,
  programsMatch,
  syncStudentSlot,
} = require('./enrollment-sync');

describe('department import Pharmacy enrollment matching', () => {
  it('keeps the three programmes separate while accepting lateral B.Pharm', () => {
    assert.equal(programsMatch('B.Pharm', 'B.Pharm'), true);
    assert.equal(programsMatch('B.Pharm', 'B.Pharm - Lateral Entry'), true);
    assert.equal(programsMatch('B.Pharm', 'D.Pharm'), false);
    assert.equal(programsMatch('B.Pharm', 'M.Pharm Pharmaceutics'), false);
    assert.equal(programsMatch('D.Pharm', 'B.Pharm'), false);
    assert.equal(programsMatch('D.Pharm', 'M.Pharm Pharmaceutics'), false);
    assert.equal(programsMatch('M.Pharm Pharmaceutics', 'D.Pharm'), false);
  });

  it('also respects semester and section', () => {
    assert.equal(allocationMatchesStudentSlot('I', 'D.Pharm', 1, null, 'D.Pharm'), true);
    assert.equal(allocationMatchesStudentSlot('II', 'D.Pharm', 1, null, 'D.Pharm'), false);
    assert.equal(allocationMatchesStudentSlot('I-B', 'D.Pharm', 1, 'A', 'D.Pharm'), false);
  });

  it('inserts only courses belonging to the student programme', async () => {
    const insertedCourseIds = [];
    const client = {
      async query(sql, params) {
        if (sql.includes('FROM academic_course_allocations')) {
          return { rows: [
            { course_id: 'b-course', program_name: 'B.Pharm', semester: 'I' },
            { course_id: 'd-course', program_name: 'D.Pharm', semester: 'I' },
            { course_id: 'm-course', program_name: 'M.Pharm Pharmaceutics', semester: 'I' },
          ] };
        }
        if (sql.includes('INSERT INTO student_course_enrollments')) {
          insertedCourseIds.push(params[2]);
          return { rows: [{ inserted: true }] };
        }
        return { rows: [] };
      },
    };

    const result = await syncStudentSlot(client, {
      tenantId: 'sgvu-tenant',
      studentUserId: 'd-pharm-student',
      program: 'D.Pharm',
      semester: 1,
      sectionCode: null,
    }, '2026-2027');

    assert.deepEqual(insertedCourseIds, ['d-course']);
    assert.equal(result.courses, 1);
    assert.equal(result.added, 1);
  });
});
