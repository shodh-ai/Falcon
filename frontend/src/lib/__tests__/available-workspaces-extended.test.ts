import { describe, it, expect } from 'vitest';
import {
  findAvailableWorkspace,
  getAvailableWorkspaces,
  normalizeWorkspaceRoleKey,
  resolveActiveWorkspaceRole,
  resolveUserRoleList,
} from '@/lib/available-workspaces';

describe('available-workspaces extended', () => {
  it('deduplicates and normalizes role lists', () => {
    expect(resolveUserRoleList({ roles: ['Faculty', ' faculty ', ''] })).toEqual(['Faculty']);
    expect(normalizeWorkspaceRoleKey('  HOD ')).toBe('hod');
  });

  it('resolves active workspace from path or fallback', () => {
    const user = { roles: ['Faculty', 'HOD'], primaryRole: 'HOD' };
    const workspaces = getAvailableWorkspaces(user);
    expect(
      resolveActiveWorkspaceRole('/hod/dashboard', user, workspaces),
    ).toMatch(/hod/i);
    expect(resolveActiveWorkspaceRole('/unknown', user, workspaces)).toMatch(/hod/i);
    expect(resolveActiveWorkspaceRole('/unknown', null, [])).toBeNull();
  });

  it('finds workspace by role key', () => {
    const workspaces = getAvailableWorkspaces({ role: 'Faculty' });
    expect(findAvailableWorkspace(workspaces, 'faculty')?.roleKey).toBe('faculty');
    expect(findAvailableWorkspace(workspaces, null)).toBeUndefined();
  });
});
