import { ForbiddenException } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { FacultyReadOnlyInterceptor } from './faculty-read-only.interceptor';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';

const observer = { user_id: 'viewer', tenant_id: 'tenant', name: 'Sachin', email: 'sachin@example.com', read_only_faculty_source_id: 'source' };
function fixture(method: string, path: string, user: any = observer, response: any = {}) {
  const req = { method, originalUrl: path, user: { ...user } };
  const context = { switchToHttp: () => ({ getRequest: () => req }) } as any;
  const next = { handle: jest.fn(() => of(response)) };
  return { req, context, next };
}
describe('read-only faculty delegation', () => {
  const interceptor = new FacultyReadOnlyInterceptor();
  it('does not affect ordinary faculty', () => {
    const f = fixture('POST', '/api/academics/faculty/attendance', { user_id: 'ordinary' });
    interceptor.intercept(f.context, f.next);
    expect(f.next.handle).toHaveBeenCalled();
    expect(f.req.user.user_id).toBe('ordinary');
  });
  it.each(['POST', 'PATCH', 'PUT', 'DELETE'])('blocks %s academic writes', method => {
    const f = fixture(method, '/api/academics/faculty/course/course/attendance');
    expect(() => interceptor.intercept(f.context, f.next)).toThrow(ForbiddenException);
    expect(f.next.handle).not.toHaveBeenCalled();
  });
  it.each(['/api/hr/employees', '/api/academics/faculty/profile/photo', '/api/academics/faculty/profile/qualifications', '/api/super-admin/impersonation/targets'])('blocks nonacademic/private reads: %s', path => {
    const f = fixture('GET', path);
    expect(() => interceptor.intercept(f.context, f.next)).toThrow(ForbiddenException);
  });
  it('reads the source timetable without changing the original actor object', () => {
    const f = fixture('GET', '/api/academics/faculty/workspaces/timetable?deptId=43');
    interceptor.intercept(f.context, f.next);
    expect(f.req.user.user_id).toBe('source');
    expect(f.req.user.observer_actor_user_id).toBe('viewer');
    expect(observer.user_id).toBe('viewer');
  });
  it.each(['/api/auth/change-password', '/api/staff/onboarding/reset-password'])('password changes stay on the observer: %s', path => {
    const f = fixture('POST', path);
    interceptor.intercept(f.context, f.next);
    expect(f.req.user.user_id).toBe('viewer');
  });
  it('removes KYC and personal fields from workload response', async () => {
    const f = fixture('GET', '/api/academics/faculty/profile', observer, {
      personal: { private: true }, kyc: { bank: 'secret' }, workload: { weekly_teaching_hours: 12 },
    });
    const result: any = await lastValueFrom(interceptor.intercept(f.context, f.next));
    expect(result.workload.weekly_teaching_hours).toBe(12);
    expect(result.kyc).toEqual({});
    expect(result.personal).toEqual({});
    expect(result.user_id).toBe('viewer');
  });
  it('requires a live enabled same-tenant/source binding at JWT validation', async () => {
    const user = { user_id: 'viewer', email: 'viewer@example.com', is_active: true, dept_id: 43, role: { role_name: 'FacultyReadOnly' } };
    const db = { query: jest.fn().mockResolvedValue([]) };
    const strategy = { authService: { findById: jest.fn().mockResolvedValue(user) }, db };
    await expect(JwtStrategy.prototype.validate.call(strategy, { sub: 'viewer', tenantId: 'tenant' } as any)).rejects.toThrow('Academic observer access is disabled');
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('source.tenant_id=b.tenant_id'), ['viewer', 'tenant', 43]);
    db.query.mockResolvedValue([{ source_user_id: 'source' }]);
    const result = await JwtStrategy.prototype.validate.call(strategy, { sub: 'viewer', tenantId: 'tenant' } as any);
    expect(result.user_id).toBe('viewer');
    expect(result).toMatchObject({ read_only_faculty_source_id: 'source', roles: ['Faculty'] });
  });
});
