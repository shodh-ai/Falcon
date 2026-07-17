import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../../../backend/src/common/guards/jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../../../backend/src/common/decorators/roles.decorator';

describe('JwtAuthGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  const guard = new JwtAuthGuard(reflector);

  it('handleRequest throws when user missing', () => {
    expect(() => guard.handleRequest(null, null, null)).toThrow(/Unauthorized/);
  });

  it('handleRequest returns user when present', () => {
    const user = { user_id: 'u1', role: 'Faculty' };
    expect(guard.handleRequest(null, user, null)).toEqual(user);
  });

  it('allows public routes without calling passport', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockImplementation((key: string) =>
      key === IS_PUBLIC_KEY ? true : undefined,
    );
    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
