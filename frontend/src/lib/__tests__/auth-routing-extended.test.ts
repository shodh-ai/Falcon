import { describe, it, expect } from 'vitest';
import {
  getAccountSettingsHrefForPortal,
  getActiveWorkspaceRoleFromPath,
  getEssBreadcrumbLeaf,
  getProfileHrefFromPath,
  getSettingsHrefFromPath,
  getWorkspaceLabelForRole,
  getWorkspaceShortLabelForRole,
  isEssTeamPath,
  resolveProfileHref,
} from '@/lib/auth-routing';

describe('auth-routing extended helpers', () => {
  it('labels workspace roles', () => {
    expect(getWorkspaceLabelForRole('faculty')).toContain('Faculty');
    expect(getWorkspaceShortLabelForRole('hod')).toBeTruthy();
  });

  it('resolves profile and settings hrefs by portal', () => {
    expect(getProfileHrefFromPath('/faculty/dashboard')).toBe('/faculty/profile');
    expect(getSettingsHrefFromPath('/hod/dashboard')).toContain('/hod');
    expect(getAccountSettingsHrefForPortal('/dean')).toContain('/dean');
  });

  it('resolveProfileHref prefers explicit profile links', () => {
    expect(resolveProfileHref('/faculty', 'Faculty', '/faculty/profile')).toBe(
      '/faculty/profile',
    );
  });

  it('detects active workspace role from path', () => {
    expect(getActiveWorkspaceRoleFromPath('/hod/inbox', ['faculty', 'hod'])).toBe('hod');
  });

  it('supports ESS navigation helpers', () => {
    expect(isEssTeamPath('/ess/team')).toBe(true);
    expect(getEssBreadcrumbLeaf('/ess/team/leaves')).toBeTruthy();
  });
});
