import { CROSS_PORTAL_DENIALS, PORTAL_RBAC } from '../../helpers/rbac-matrix';

function canAccessPortal(role: string, portalPrefix: string): boolean {
  const allowed = PORTAL_RBAC[portalPrefix] ?? [];
  return allowed.includes(role.trim().toLowerCase());
}

describe('RBAC regression — portal route guards', () => {
  it('defines workspace portal matrices', () => {
    expect(PORTAL_RBAC['/faculty']).toContain('faculty');
    expect(PORTAL_RBAC['/hod']).toContain('hod');
    expect(PORTAL_RBAC['/dean']).toContain('dean');
    expect(PORTAL_RBAC['/exam-cell']).toContain('examcell');
    expect(PORTAL_RBAC['/admin']).toContain('registrar');
  });

  it.each(CROSS_PORTAL_DENIALS)(
    'denies $role access to $deniedPath',
    ({ role, deniedPath, allowedPortal }) => {
      const portal = `/${deniedPath.split('/')[1]}`;
      expect(canAccessPortal(role, portal)).toBe(false);
      expect(canAccessPortal(role, allowedPortal)).toBe(true);
    },
  );

  it('allows superadmin on exam cell portal only via matrix', () => {
    expect(canAccessPortal('superadmin', '/exam-cell')).toBe(true);
    expect(canAccessPortal('superadmin', '/faculty')).toBe(false);
  });
});
