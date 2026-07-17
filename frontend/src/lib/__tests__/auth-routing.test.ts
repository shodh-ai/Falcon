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
