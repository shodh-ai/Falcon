import { HrApiPolicyController } from './hr-api-policy.controller';
import { HR_PERMISSION_KEY } from '../../common/decorators/hr-permission.decorator';
describe('HR API policy controller boundary', () => {
  const user = { user_id: 'actor', tenant_id: 'tenant', roles: ['HRAdmin'] };
  function controller() {
    const policies = {
      create: jest.fn(),
      update: jest.fn(),
      publish: jest.fn(),
      preview: jest.fn(),
      saveCalculation: jest.fn(),
      calculations: jest.fn(),
    };
    const resolveRequestEntityId = jest.fn().mockResolvedValue(7);
    return {
      policies,
      resolveRequestEntityId,
      controller: new HrApiPolicyController(
        policies as never,
        { resolveRequestEntityId } as never,
      ),
    };
  }
  it('derives tenant, actor and entity from authenticated context rather than body fields', async () => {
    const ctx = controller();
    const body = { tenant_id: 'spoof', actor_user_id: 'spoof', entity_id: 999 };
    await ctx.controller.create({ user }, body, 'request-id', '7');
    expect(ctx.resolveRequestEntityId).toHaveBeenCalledWith(
      'tenant',
      'actor',
      ['HRAdmin'],
      '7',
    );
    expect(ctx.policies.create).toHaveBeenCalledWith(
      { tenantId: 'tenant', entityId: 7, actorId: 'actor' },
      body,
      'request-id',
    );
  });
  it('refuses a stale or missing revision before a state change', async () => {
    const ctx = controller();
    await expect(
      ctx.controller.update({ user }, 'id', {}, '', '7'),
    ).rejects.toThrow('If-Match');
    expect(ctx.policies.update).not.toHaveBeenCalled();
  });
  it('requires an authenticated tenant instead of silently selecting the default university', async () => {
    const ctx = controller();
    await expect(
      ctx.controller.preview({ user: { user_id: 'actor' } }, {}, '7'),
    ).rejects.toThrow('tenant context');
    expect(ctx.policies.preview).not.toHaveBeenCalled();
  });
  it('marks policy changes as writes and simulations as read-authorized operations', () => {
    expect(
      Reflect.getMetadata(
        HR_PERMISSION_KEY,
        HrApiPolicyController.prototype.publish,
      ),
    ).toEqual({ module: 'policies', level: 'write' });
    expect(
      Reflect.getMetadata(
        HR_PERMISSION_KEY,
        HrApiPolicyController.prototype.preview,
      ),
    ).toEqual({ module: 'policies', level: 'read' });
  });
});
