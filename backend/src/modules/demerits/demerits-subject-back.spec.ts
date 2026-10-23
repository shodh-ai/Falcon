import { DemeritsService } from './demerits.service';

describe('discipline approval transaction at the subject-back threshold', () => {
  function setup(enrollmentFailure = false) {
    const incident = { incident_id: 'incident', tenant_id: 'tenant', student_user_id: 'student', course_id: 'course', points: 2, status: 'PENDING_DC_REVIEW' };
    const qr = {
      connect: jest.fn(), startTransaction: jest.fn(), commitTransaction: jest.fn(), rollbackTransaction: jest.fn(), release: jest.fn(),
      query: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT * FROM demerit_incidents')) return [incident];
        if (sql.includes('UPDATE student_course_enrollments')) {
          if (sql.includes('updated_at')) throw new Error('column updated_at does not exist');
          if (enrollmentFailure) throw new Error('Enrollment update failed');
        }
        return [];
      }),
    };
    const db = { createQueryRunner: () => qr, query: jest.fn().mockResolvedValue([{ ...incident, status: 'APPROVED_BY_DC' }]) };
    const service = new DemeritsService(db as any);
    jest.spyOn(service as any, 'ensureSummaryLocked').mockResolvedValue({ cumulative_demerit_points: 4 });
    jest.spyOn(service as any, 'tableExists').mockResolvedValue(true);
    jest.spyOn(service as any, 'enrichIncident').mockImplementation((row) => row);
    return { service, qr };
  }

  it('commits the approval and enrollment outcome using the existing enrollment schema', async () => {
    const { service, qr } = setup();
    const result = await service.reviewIncident('tenant', 'incident', 'reviewer', { status: 'APPROVED_BY_DC', dc_committee_remarks: 'Mock review' });
    expect(result.status).toBe('APPROVED_BY_DC');
    expect(qr.commitTransaction).toHaveBeenCalledTimes(1);
    expect(qr.rollbackTransaction).not.toHaveBeenCalled();
    expect(qr.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back rather than reporting approval when applying the enrollment outcome fails', async () => {
    const { service, qr } = setup(true);
    await expect(service.reviewIncident('tenant', 'incident', 'reviewer', { status: 'APPROVED_BY_DC', dc_committee_remarks: 'Mock review' })).rejects.toThrow('Enrollment update failed');
    expect(qr.commitTransaction).not.toHaveBeenCalled();
    expect(qr.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(qr.release).toHaveBeenCalledTimes(1);
  });
});
