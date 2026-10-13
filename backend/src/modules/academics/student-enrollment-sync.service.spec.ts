import { StudentEnrollmentSyncService } from './student-enrollment-sync.service';

describe('StudentEnrollmentSyncService roster safety', () => {
  it('does not assume a CSE programme for an incomplete student profile', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ program: null }]);
    const service = new StudentEnrollmentSyncService({ query } as any);

    expect(await service.syncStudent('tenant-1', 'student-1')).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('recovers only an unambiguous enrolled section for the current semester', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ current_semester: 3, section_code: null }])
      .mockResolvedValueOnce([{ section_code: 'B' }]);
    const service = new StudentEnrollmentSyncService({ query } as any);

    expect(await service.resolveStudentSlot('tenant-1', 'student-1', 'BTECH CSE'))
      .toMatchObject({ semester: 3, sectionCode: 'B' });
    expect(query.mock.calls[1][0]).toContain("status = 'ENROLLED'");
  });

  it('does not guess a section when old enrollments disagree', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ current_semester: 3, section_code: null }])
      .mockResolvedValueOnce([{ section_code: 'A' }, { section_code: 'B' }]);
    const service = new StudentEnrollmentSyncService({ query } as any);

    expect(await service.resolveStudentSlot('tenant-1', 'student-1', 'BTECH CSE'))
      .toMatchObject({ semester: 3, sectionCode: null });
  });

  it('does not invent Semester I for a profile with no semester or enrollments', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ current_semester: null, section_code: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ semester: null }]);
    const service = new StudentEnrollmentSyncService({ query } as any);

    expect(await service.resolveStudentSlot('tenant-1', 'student-1', 'B.Pharm'))
      .toBeNull();
  });

  it('preserves existing enrollments when no allocation matches the verified slot', async () => {
    const query = jest.fn().mockResolvedValueOnce([
      { course_id: 'wrong-section', program_name: 'BTECH CSE', semester: 'III-B' },
      { course_id: 'wrong-degree', program_name: 'MTECH CSE', semester: 'III' },
    ]);
    const service = new StudentEnrollmentSyncService({ query } as any);

    const result = await service.syncStudentSlot({
      tenantId: 'tenant-1', studentUserId: 'student-1',
      program: 'BTECH CSE', semester: 3, sectionCode: null,
    }, '2026-2027');
    expect(result).toMatchObject({ added: 0, removed: 0, kept: 0 });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('does not prune a sectioned roster just because an unsectioned elective matched', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([
        { course_id: 'elective', program_name: 'BTECH CSE', semester: 'III' },
        { course_id: 'section-a', program_name: 'BTECH CSE', semester: 'III-A' },
        { course_id: 'section-b', program_name: 'BTECH CSE', semester: 'III-B' },
      ])
      .mockResolvedValueOnce([{ inserted: true }]);
    const service = new StudentEnrollmentSyncService({ query } as any);

    expect(await service.syncStudentSlot({
      tenantId: 'tenant-1', studentUserId: 'student-1',
      program: 'BTECH CSE', semester: 3, sectionCode: null,
    }, '2026-2027')).toMatchObject({ added: 1, removed: 0 });
    expect(query.mock.calls.filter(([sql]) => sql.includes('DELETE FROM student_course_enrollments'))).toHaveLength(0);
  });
});
