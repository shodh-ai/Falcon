import { describe, expect, it } from 'vitest';
import { canRoleAccessPath, getDashboardPathForRole, getPostLoginPath } from '@/lib/auth-routing';
import { canAccessStudentPath, filterStudentPortalConfigForRoles, getStudentLandingPath } from '@/lib/student-access';

describe('Student and Applicant access', () => {
  it.each([
    '/student/profile', '/student/profile?tab=contact', '/student/profile/',
    '/student/admission-vault', '/student/settings',
    '/student/onboarding/step-1', '/student/onboarding/step-2', '/student/onboarding/step-3',
  ])('permits Applicant admission essentials: %s', (path) => {
    expect(canRoleAccessPath('Applicant', path)).toBe(true);
  });

  it.each([
    '/student', '/student/dashboard', '/student/attendance', '/student/finance',
    '/student/courses/a', '/student/marks', '/student/library', '/student/placements',
    '/student/profile/certificates', '/student/profile/future-feature',
    '/student/onboarding/step-4', '/student/settings-extra',
  ])('denies Applicant student-only paths: %s', (path) => {
    expect(canRoleAccessPath('Applicant', path)).toBe(false);
    expect(canRoleAccessPath(['Applicant', 'Faculty'], path)).toBe(false);
    expect(canRoleAccessPath(['Applicant', 'Student'], path)).toBe(true);
  });

  it('does not grant student workspace access to other roles', () => {
    expect(canAccessStudentPath('Faculty', '/student/profile')).toBe(false);
    expect(canRoleAccessPath('Faculty', '/faculty/dashboard')).toBe(true);
    expect(canRoleAccessPath('Faculty', '/student/courses')).toBe(false);
  });

  it('lands completed Applicants on an allowed route while preserving Student onboarding', () => {
    expect(getDashboardPathForRole('Applicant')).toBe('/student/profile');
    expect(getStudentLandingPath(['Applicant', 'Student'])).toBe('/student/dashboard');
    expect(getPostLoginPath({ role: 'Applicant', onboarding_status: 'COMPLETED' })).toBe('/student/profile');
    expect(getPostLoginPath({ role: 'Applicant', roles: ['Applicant', 'Student'], onboarding_status: 'COMPLETED' })).toBe('/student/dashboard');
    expect(getPostLoginPath({ role: 'Applicant', onboarding_status: 'PENDING_DOCUMENTS' })).toBe('/student/onboarding/step-2');
    expect(getPostLoginPath({ role: 'Applicant', onboarding_status: 'COMPLETED', password_reset_required: true })).toBe('/student/onboarding/step-1');
  });

  it('applies the same policy to sidebar, command palette and mobile navigation', () => {
    const config = {
      navGroups: [{ title: 'Overview', items: [{ href: '/student/dashboard' }] }, { title: 'Profile', items: [{ href: '/student/profile' }, { href: '/student/profile/certificates' }] }],
      commandItems: [{ href: '/student/finance' }, { href: '/student/admission-vault' }],
      mobileNavItems: [{ href: '/student/courses' }, { href: '/student/settings' }],
    };
    const filtered = filterStudentPortalConfigForRoles(config, 'Applicant');
    expect(filtered.navGroups).toEqual([{ title: 'Profile', items: [{ href: '/student/profile' }] }]);
    expect(filtered.commandItems).toEqual([{ href: '/student/admission-vault' }]);
    expect(filtered.mobileNavItems).toEqual([{ href: '/student/settings' }]);
    expect(filterStudentPortalConfigForRoles(config, ['Applicant', 'Student'])).toBe(config);
    expect(filterStudentPortalConfigForRoles(config, 'Faculty')).toBe(config);
    expect(config.navGroups).toHaveLength(2);
  });
});
