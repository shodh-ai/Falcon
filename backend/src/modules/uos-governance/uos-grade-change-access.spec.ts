import { ForbiddenException } from '@nestjs/common';
import { UosGovernanceService } from './uos-governance.service';

describe('UOS grade-change teaching access', () => {
  it('rejects a request when the faculty does not teach the student subject', async () => {
    const db = { query: jest.fn().mockResolvedValueOnce([]) };
    const service = new UosGovernanceService(db as any, {} as any, {} as any);

    await expect(
      service.createGradeChange('tenant-id', 'faculty-id', {
        student_user_id: 'student-id',
        course_code: 'BP501T',
        from_grade: 'C',
        to_grade: 'B',
        reason: 'Verified correction',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const sql = db.query.mock.calls[0][0] as string;
    expect(sql).toContain("a.status = 'ACTIVE'");
    expect(sql).toContain('t.deleted_at IS NULL');
    expect(sql).toContain("e.status = 'ENROLLED'");
  });
});
