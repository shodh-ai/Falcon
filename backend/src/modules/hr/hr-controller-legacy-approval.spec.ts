jest.mock('archiver', () => ({ ZipArchive: class {} }));

import { BadRequestException, GoneException } from '@nestjs/common';
import { HrController } from './hr.controller';

describe('legacy HR leave decision routes', () => {
  const tenantId = '10000000-0000-4000-8000-000000000001';
  const actor = {
    user_id: '20000000-0000-4000-8000-000000000002',
    tenant_id: tenantId,
    roles: ['HR'],
  };

  function makeController() {
    const actOnScopedTeamRequest = jest.fn().mockResolvedValue({ status: 'HR_APPROVED' });
    const resolveEntityId = jest.fn().mockResolvedValue(7);
    const controller = Object.assign(Object.create(HrController.prototype), {
      workforce: { actOnScopedTeamRequest },
      entityCtx: { resolveEntityId },
      hr: { actOnStaffLeave: jest.fn() },
    }) as HrController;
    return { controller, actOnScopedTeamRequest, resolveEntityId };
  }

  it('routes the old status endpoint through scoped workflow execution', async () => {
    const { controller, actOnScopedTeamRequest, resolveEntityId } = makeController();
    await controller.actOnStaffLeave('leave-id', { user: actor }, 'HR_APPROVED', '7');
    expect(resolveEntityId).toHaveBeenCalledWith(tenantId, '7');
    expect(actOnScopedTeamRequest).toHaveBeenCalledWith(
      actor.user_id, tenantId, 7, 'leave-id', 'APPROVE', ['HR'],
    );
  });

  it('rejects invented decision values before touching workflow state', async () => {
    const { controller, actOnScopedTeamRequest } = makeController();
    await expect(
      controller.actOnStaffLeave('leave-id', { user: actor }, 'UNKNOWN' as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(actOnScopedTeamRequest).not.toHaveBeenCalled();
  });

  it('rejects the legacy action model that accepted a client-supplied actor ID', () => {
    const { controller, actOnScopedTeamRequest } = makeController();
    expect(() => controller.act()).toThrow(GoneException);
    expect(actOnScopedTeamRequest).not.toHaveBeenCalled();
  });
});
