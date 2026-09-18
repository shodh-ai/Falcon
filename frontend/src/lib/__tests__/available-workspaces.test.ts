import { describe, it, expect } from 'vitest';
import {
  getAvailableWorkspaces,
  resolveActiveWorkspaceRole,
} from '@/lib/available-workspaces';

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

  it('prefers the primary role when multiple roles share the same portal', () => {
    const user = {
      role: 'ProcurementBuyer',
      roles: ['ProcurementBuyer', 'APClerk'],
      primaryRole: 'ProcurementBuyer',
    };
    const workspaces = getAvailableWorkspaces(user);

    expect(workspaces.map((workspace) => workspace.role)).toEqual([
      'APClerk',
      'ProcurementBuyer',
    ]);
    expect(
      resolveActiveWorkspaceRole('/finance/acquisitions/test-id', user, workspaces),
    ).toBe('ProcurementBuyer');
  });
});
