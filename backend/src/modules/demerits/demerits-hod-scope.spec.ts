import { DemeritsService } from './demerits.service';

describe('Demerits HOD scope', () => {
  it('loads department students and courses for an HOD', async () => {
    const db = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ dept_id: 17 }])
        .mockResolvedValueOnce([{ dept_id: 17 }])
        .mockResolvedValueOnce([{ user_id: 'student-1', name: 'Student' }])
        .mockResolvedValueOnce([{ course_id: 'course-1', course_code: 'BP501T' }]),
    };
    const service = new DemeritsService(db as any);

    const result = await service.getFormOptions('tenant-id', 'hod-id', true);

    expect(result.students).toEqual([{ user_id: 'student-1', name: 'Student' }]);
    expect(result.courses).toEqual([{ course_id: 'course-1', course_code: 'BP501T' }]);
    expect(db.query.mock.calls[2][0]).toContain('u.dept_id = ANY');
    expect(db.query.mock.calls[3][0]).toContain('f.dept_id = ANY');
  });

  it('keeps faculty form options teaching-scoped', async () => {
    const db = {
      query: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
    };
    const service = new DemeritsService(db as any);

    await service.getFormOptions('tenant-id', 'faculty-id', false);

    expect(db.query.mock.calls[0][0]).toContain('academic_course_allocations fca');
    expect(db.query.mock.calls[1][0]).toContain('academic_timetables ft');
  });
});
