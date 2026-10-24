import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { ModuleAvailabilityInterceptor } from './module-availability.interceptor';

function context(request: unknown) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}
const next: CallHandler = { handle: () => of('allowed') };

describe('ModuleAvailabilityInterceptor', () => {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(undefined),
  } as never;

  it('allows active module traffic', async () => {
    const interceptor = new ModuleAvailabilityInterceptor(reflector, {
      effectiveState: jest
        .fn()
        .mockResolvedValue({ state: 'ACTIVE', available: true, revision: 1 }),
    } as never);
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
    } as never);
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
    } as never);
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
    } as never);
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

  it.each([
    ['/api/student/finance', 'finance_procurement'],
    ['/api/student/library', 'library'],
    ['/api/student/transport', 'transport'],
    ['/api/student/exam-desk', 'examinations_credentials'],
    ['/api/student/placements', 'placements_alumni'],
    ['/api/student/admission-vault', 'admissions_onboarding'],
  ])(
    'rejects direct student API %s when its own module is disabled',
    async (path, owner) => {
      const effectiveState = jest
        .fn()
        .mockResolvedValue({ state: 'OFF', available: false, revision: 2 });
      const interceptor = new ModuleAvailabilityInterceptor(reflector, {
        effectiveState,
      } as never);
      await expect(
        lastValueFrom(
          interceptor.intercept(
            context({
              path,
              method: 'GET',
              user: { tenant_id: 't', user_id: 's', role: 'Student' },
            }),
            next,
          ),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(effectiveState).toHaveBeenCalledWith(
        owner,
        expect.objectContaining({ tenantId: 't', userId: 's' }),
      );
    },
  );
});
