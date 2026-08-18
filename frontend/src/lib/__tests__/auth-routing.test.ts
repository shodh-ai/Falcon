import { describe, it, expect } from 'vitest';
import {
  canRoleAccessPath,
  getDashboardPathForRole,
  getPostLoginPath,
} from '@/lib/auth-routing';

describe('Auth routing — dashboards', () => {
  it('maps roles to workspace dashboards', () => {
    expect(getDashboardPathForRole('Faculty')).toBe('/faculty/dashboard');
    expect(getDashboardPathForRole('HOD')).toBe('/hod/dashboard');
    expect(getDashboardPathForRole('Dean')).toBe('/dean/dashboard');
    expect(getDashboardPathForRole('examcell')).toBe('/exam-cell/dashboard');
  });

  it('maps Super Admin and Campus Admin to separate portals', () => {
    expect(getDashboardPathForRole('SuperAdmin')).toBe('/super-admin/dashboard');
    expect(getDashboardPathForRole('CampusAdmin')).toBe('/campus-admin/dashboard');
  });
});

describe('Auth routing — protected paths', () => {
  it('allows faculty on faculty routes', () => {
    expect(canRoleAccessPath('faculty', '/faculty/dashboard')).toBe(true);
    expect(canRoleAccessPath('faculty', '/faculty/attendance')).toBe(true);
  });

  it('denies faculty on HOD and dean routes', () => {
    expect(canRoleAccessPath('faculty', '/hod/dashboard')).toBe(false);
    expect(canRoleAccessPath('faculty', '/dean/dashboard')).toBe(false);
  });

  it('denies HOD on dean-only routes', () => {
    expect(canRoleAccessPath('hod', '/dean/inbox')).toBe(false);
  });

  it('allows examcell on exam cell portal', () => {
    expect(canRoleAccessPath('examcell', '/exam-cell/results')).toBe(true);
  });

  it('denies dean on super-admin entities without creator email', () => {
    expect(canRoleAccessPath('dean', '/super-admin/dashboard')).toBe(false);
  });

  it('keeps Super Admin off Campus Admin portal routes', () => {
    expect(canRoleAccessPath('superadmin', '/super-admin/dashboard')).toBe(true);
    expect(canRoleAccessPath('superadmin', '/campus-admin/dashboard')).toBe(false);
    expect(canRoleAccessPath('campusadmin', '/campus-admin/dashboard')).toBe(true);
    expect(canRoleAccessPath('campusadmin', '/super-admin/dashboard')).toBe(false);
  });

  it('removes impersonation, master settings, and DOFA vault from Campus Admin', () => {
    expect(canRoleAccessPath('campusadmin', '/campus-admin/impersonation')).toBe(false);
    expect(canRoleAccessPath('campusadmin', '/campus-admin/settings')).toBe(false);
    expect(canRoleAccessPath('campusadmin', '/campus-admin/entities')).toBe(false);
    expect(canRoleAccessPath('campusadmin', '/campus-admin/override-logs')).toBe(false);
    expect(canRoleAccessPath('campusadmin', '/admin/dofa-policy-vault')).toBe(false);
    expect(canRoleAccessPath('campusadmin', '/admin/departments')).toBe(false);
    expect(canRoleAccessPath('campusadmin', '/campus-admin/account/settings')).toBe(true);
    expect(canRoleAccessPath('campusadmin', '/campus-admin/hierarchy')).toBe(true);
    expect(canRoleAccessPath('superadmin', '/super-admin/impersonation')).toBe(true);
    expect(canRoleAccessPath('superadmin', '/super-admin/settings')).toBe(true);
    expect(canRoleAccessPath('superadmin', '/admin/dofa-policy-vault')).toBe(true);
    expect(canRoleAccessPath('superadmin', '/admin/departments')).toBe(true);
    expect(canRoleAccessPath('registrar', '/admin/departments')).toBe(true);
  });
});

describe('Auth routing — post login', () => {
  it('routes completed onboarding faculty to dashboard', () => {
    expect(
      getPostLoginPath({
        role: 'Faculty',
        onboarding_status: 'COMPLETED',
      }),
    ).toContain('/faculty');
  });
});
