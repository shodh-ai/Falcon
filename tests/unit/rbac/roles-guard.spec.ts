import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../../backend/src/common/guards/roles.guard';

function mockContext(user: unknown): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard({ getAllAndOverride: jest.fn() } as unknown as Reflector);

  beforeEach(() => {
    (guard as unknown as { reflector: Reflector }).reflector = {
      getAllAndOverride: jest.fn((_key, _targets) => ['Dean']),
    } as unknown as Reflector;
  });

  it('allows matching role', () => {
    const ctx = mockContext({ role: 'Dean', roles: ['Dean'] });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies faculty for dean routes', () => {
    const ctx = mockContext({ role: 'Faculty', roles: ['Faculty'] });
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('denies when user missing', () => {
    const ctx = mockContext(undefined);
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('allows when no roles metadata', () => {
    const ctx = mockContext({ role: 'Faculty' });
    (guard as unknown as { reflector: Reflector }).reflector = {
      getAllAndOverride: jest.fn(() => undefined),
    } as unknown as Reflector;
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
