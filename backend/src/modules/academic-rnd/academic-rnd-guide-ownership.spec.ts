import { ForbiddenException } from '@nestjs/common';
import { AcademicRndService } from './academic-rnd.service';

describe('research guide approval ownership', () => {
  const applicationId = '30000000-0000-4000-8000-000000000001';
  const query = jest.fn();
  const notifyStudent = jest.fn();
  let service: AcademicRndService;

  beforeEach(() => {
    jest.resetAllMocks();
    query.mockResolvedValueOnce([{ tenant_id: 'test-tenant' }]);
    service = Object.assign(Object.create(AcademicRndService.prototype), {
      db: { query, transaction: (run: any) => run({ query }) }, notifyStudent,
    });
  });

  it.each(['approve', 'reject'])('prevents another faculty member from performing %s', async (action) => {
    query.mockResolvedValueOnce([{ status: 'PENDING_GUIDE', guide_faculty_user_id: 'assigned-guide' }]);
    const result = action === 'approve'
      ? service.approveGuide('test-tenant', 'other-guide', applicationId, {})
      : service.rejectGuide('test-tenant', 'other-guide', applicationId, 'Test reason');
    await expect(result).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).toHaveBeenCalledTimes(2);
    expect(notifyStudent).not.toHaveBeenCalled();
  });

  it.each(['assigned-guide', null])('permits the assigned guide or an unassigned common-queue application (%s)', async (guide) => {
    query.mockResolvedValueOnce([{ status: 'PENDING_GUIDE', guide_faculty_user_id: guide, student_user_id: 'test-student', project_title: 'Test' }])
      .mockResolvedValueOnce([{ status: 'PENDING_BUDGET' }])
      .mockResolvedValueOnce([]);
    await expect(service.approveGuide('test-tenant', 'assigned-guide', applicationId, {})).resolves.toEqual({ status: 'PENDING_BUDGET' });
    expect(query.mock.calls[2][1]).toEqual([applicationId, 'test-tenant', 'assigned-guide', 'PENDING_BUDGET']);
    expect(notifyStudent).toHaveBeenCalledTimes(1);
  });
});
