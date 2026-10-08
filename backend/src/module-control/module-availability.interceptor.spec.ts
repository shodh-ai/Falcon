import {
  CallHandler,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { ModuleAvailabilityInterceptor } from './module-availability.interceptor';

function context(request: any) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as any;
}
const next: CallHandler = { handle: () => of('allowed') };

describe('ModuleAvailabilityInterceptor', () => {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(undefined),
  } as any;

  it('allows active module traffic', async () => {
    const interceptor = new ModuleAvailabilityInterceptor(reflector, {
      effectiveState: jest
        .fn()
        .mockResolvedValue({ state: 'ACTIVE', available: true, revision: 1 }),
    } as any);
    await expect(
      lastValueFrom(
        interceptor.intercept(
          context({
            path: '/api/procurements/v1/cases',
            method: 'POST',
            user: { tenant_id: 't' },
          }),
          next,
        ),
      ),
    ).resolves.toBe('allowed');
  });

  it('uses a structured 403 for disabled direct work', async () => {
    const interceptor = new ModuleAvailabilityInterceptor(reflector, {
      effectiveState: jest
        .fn()
        .mockResolvedValue({ state: 'OFF', available: false, revision: 2 }),
    } as any);
    await expect(
      lastValueFrom(
        interceptor.intercept(
          context({
            path: '/api/procurements/v1/cases',
            method: 'POST',
            user: { tenant_id: 't' },
          }),
          next,
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('uses a structured 409 for paused writes', async () => {
    const interceptor = new ModuleAvailabilityInterceptor(reflector, {
      effectiveState: jest
        .fn()
        .mockResolvedValue({ state: 'PAUSED', available: false, revision: 3 }),
    } as any);
    await expect(
      lastValueFrom(
        interceptor.intercept(
          context({
            path: '/api/hr/employees',
            method: 'PATCH',
            user: { tenant_id: 't' },
          }),
          next,
        ),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('keeps auditor reads available while writes remain blocked', async () => {
    const interceptor = new ModuleAvailabilityInterceptor(reflector, {
      effectiveState: jest
        .fn()
        .mockResolvedValue({ state: 'OFF', available: false, revision: 4 }),
    } as any);
    await expect(
      lastValueFrom(
        interceptor.intercept(
          context({
            path: '/api/library/audit',
            method: 'GET',
            user: { tenant_id: 't', role: 'InternalAuditor' },
          }),
          next,
        ),
      ),
    ).resolves.toBe('allowed');
  });
});
