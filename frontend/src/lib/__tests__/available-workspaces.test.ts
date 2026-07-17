import { describe, it, expect } from 'vitest';
import { getAvailableWorkspaces } from '@/lib/available-workspaces';

describe('Workspace switching', () => {
  it('lists multiple hats for multi-role users', () => {
    const workspaces = getAvailableWorkspaces({
      roles: ['Faculty', 'HOD'],
      primaryRole: 'Faculty',
    });
    const keys = workspaces.map((w) => w.roleKey);
    expect(keys).toContain('faculty');
    expect(keys).toContain('hod');
  });

  it('returns single workspace for faculty-only user', () => {
    const workspaces = getAvailableWorkspaces({ role: 'Faculty' });
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].href).toContain('/faculty');
  });
});
