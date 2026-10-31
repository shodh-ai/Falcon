import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalAuthProvider } from './providers/local-auth.provider';
import { User } from '../entities/user.entity';
const office = {
  office_id: 'office',
  appointment_id: 'appointment',
  dept_id: 43,
  kind: 'PRINCIPAL' as const,
  login_alias: 'principal.pharma@mygyanvihar.com',
};
function svc(context: object) {
  return new AuthService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    undefined,
    { context: async () => context } as any,
  );
}
function person(role = 'Faculty', other: string[] = []) {
  return {
    user_id: 'person',
    tenant_id: 'tenant',
    role: { role_name: role },
    userRoles: other.map((r) => ({ role: { role_name: r } })),
  } as User;
}
describe('office claims', () => {
  test('named Faculty becomes Principal without a persisted role rewrite', async () => {
    const s = svc({ managed: true, offices: [office] });
    const u = person();
    await s.applyLeadershipClaims(u);
    expect(s.getRoleClaims(u)).toEqual({
      roles: ['Faculty', 'Principal'],
      primaryRole: 'Principal',
    });
    expect(u.role?.role_name).toBe('Faculty');
    expect(u.office_context).toEqual(office);
  });
  test('ended HOD loses HOD and auto-Dean, preserving teaching identity', async () => {
    const s = svc({ managed: true, offices: [], explicitDean: false });
    const u = person('HOD', ['Faculty', 'Dean']);
    await s.applyLeadershipClaims(u);
    expect(s.getRoleClaims(u)).toEqual({
      roles: ['Faculty'],
      primaryRole: 'Faculty',
    });
  });
  test('independent Dean appointment is preserved', async () => {
    const s = svc({ managed: true, offices: [], explicitDean: true });
    const u = person('HOD', ['Faculty', 'Dean']);
    await s.applyLeadershipClaims(u);
    expect(s.getRoleClaims(u).roles).toContain('Dean');
  });
  test('other departments retain their effective roles', async () => {
    const s = svc({ managed: false, offices: [] });
    const u = person('HOD', ['Dean']);
    await s.applyLeadershipClaims(u);
    expect(s.getRoleClaims(u).roles).toEqual(['HOD', 'Dean']);
  });
  test('old office context is rejected after replacement', async () => {
    await expect(
      svc({ managed: true, offices: [] }).applyLeadershipClaims(
        person(),
        office,
      ),
    ).rejects.toThrow('Office appointment changed');
  });
  test('JWT identifies human, office and auth revision', () => {
    const jwt = { sign: jest.fn().mockReturnValue('token') };
    const u = person();
    u.office_context = office;
    u.leadership_auth_revision = 7;
    new LocalAuthProvider(jwt as any).signToken(u, 'tenant', 'public');
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'person',
        office_context: office,
        leadership_auth_revision: 7,
      }),
    );
  });
  test('changed auth revision invalidates previously issued sessions before enrichment', async () => {
    const findById = jest
      .fn()
      .mockResolvedValue({ is_active: true, leadership_auth_revision: 2 });
    const strategy = new JwtStrategy(
      { get: () => 'test-secret-with-at-least-32-characters' } as any,
      { findById, syncMultiHatWorkspaceRoles:async()=>{},loadUserWithSyncedWorkspaceRoles:async()=>({is_active:true,leadership_auth_revision:2}), applyLeadershipClaims:async()=>{} } as any,
      {} as any,
    );
    await expect(
      strategy.validate({
        sub: 'person',
        tenantId: 'tenant',
        tenantSchema: 'public',
        name: 'person',
        email: 'person@example.edu',
        leadership_auth_revision: 1,
      }),
    ).rejects.toThrow('Office assignment changed');
  });
});
