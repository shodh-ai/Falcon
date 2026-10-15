import { of, lastValueFrom } from 'rxjs';
import { ForbiddenException } from '@nestjs/common';
import { StaffProfileFreezeInterceptor } from './staff-profile-freeze.interceptor';

describe('StaffProfileFreezeInterceptor', () => {
  const next = { handle: () => of('allowed') };
  const context = (path: string, userId = 'staff-1') => ({
    switchToHttp: () => ({ getRequest: () => ({
      user: { user_id: userId, tenant_id: 'tenant-1' }, originalUrl: path, method: 'GET',
    }) }),
  });

  it('blocks a frozen account from direct business API calls', async () => {
    const db = { query: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const gate = new StaffProfileFreezeInterceptor(db as never);
    await expect(lastValueFrom(gate.intercept(context('/api/academics/faculty/dashboard') as never, next)))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("v.source = 'PHARMACY_RECHECK'"),
      ['tenant-1', 'staff-1']);
  });

  it('allows login status and the targeted HR correction channel', async () => {
    const db = { query: jest.fn() };
    const gate = new StaffProfileFreezeInterceptor(db as never);
    for (const path of ['/api/auth/me', '/auth/profile', '/api/staff/profile-review/me',
      '/api/staff/profile-review/me/corrections', '/api/staff/profile-review/me/documents/PAN']) {
      await expect(lastValueFrom(gate.intercept(context(path) as never, next))).resolves.toBe('allowed');
    }
    expect(db.query).not.toHaveBeenCalled();
  });

  it('does not restrict users without an active recheck', async () => {
    const db = { query: jest.fn().mockResolvedValue([]) };
    const gate = new StaffProfileFreezeInterceptor(db as never);
    await expect(lastValueFrom(gate.intercept(context('/api/academics/faculty/dashboard') as never, next)))
      .resolves.toBe('allowed');
  });
});
