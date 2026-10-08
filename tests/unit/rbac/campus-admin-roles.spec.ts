import {
  expandCampusAdminRoles,
  isCampusAdminFamilyRole,
  rolesIntersect,
} from '../../../backend/src/common/config/campus-admin.roles';

describe('Campus admin roles (backend util)', () => {
  it('detects campus admin family roles', () => {
    expect(isCampusAdminFamilyRole('CampusAdmin')).toBe(true);
    expect(isCampusAdminFamilyRole('SuperAdmin')).toBe(true);
    expect(isCampusAdminFamilyRole('Faculty')).toBe(false);
  });

  it('expands CampusAdmin to legacy roles', () => {
    const expanded = expandCampusAdminRoles(['CampusAdmin']);
    expect(expanded).toEqual(expect.arrayContaining(['superadmin', 'admissionsofficer']));
  });

  it('allows CampusAdmin through SuperAdmin gate', () => {
    expect(rolesIntersect(['CampusAdmin'], ['SuperAdmin'])).toBe(true);
  });

  it('denies faculty for dean-only roles', () => {
    expect(rolesIntersect(['Faculty'], ['Dean'])).toBe(false);
  });

  it('allows HOD through HOD gate', () => {
    expect(rolesIntersect(['HOD'], ['HOD', 'SuperAdmin'])).toBe(true);
  });
});
