import { FacultyTeachingDepartmentsService } from './faculty-teaching-departments.service';

describe('FacultyTeachingDepartmentsService course scope', () => {
  it('includes active timetable assignments when an allocation row is absent', () => {
    const service = new FacultyTeachingDepartmentsService({} as never);
    const sql = service.facultyCoursesCte(3);

    expect(sql).toContain('FROM academic_course_allocations a');
    expect(sql).toContain('UNION');
    expect(sql).toContain('FROM academic_timetables t');
    expect(sql).toContain('t.faculty_user_id = $2');
    expect(sql).toContain('t.deleted_at IS NULL');
    expect(sql).toContain('timetable_faculty.dept_id = $3');
  });
});
