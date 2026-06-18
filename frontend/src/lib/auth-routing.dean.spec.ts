import { getDashboardPathForRole, getWorkspaceLabelForRole } from '@/lib/auth-routing';

describe('Dean portal routing', () => {
  it('maps Dean to /dean/dashboard', () => {
    expect(getDashboardPathForRole('Dean')).toBe('/dean/dashboard');
    expect(getDashboardPathForRole('dean')).toBe('/dean/dashboard');
  });

  it('maps HOD separately from Dean', () => {
    expect(getDashboardPathForRole('HOD')).toBe('/hod/dashboard');
    expect(getDashboardPathForRole('Dean')).not.toBe('/hod/dashboard');
  });

  it('uses Dean workspace labels', () => {
    expect(getWorkspaceLabelForRole('Dean')).toBe('Dean Workspace');
    expect(getWorkspaceLabelForRole('HOD')).toBe('HOD Workspace');
  });
});
