import { describe, expect, it } from 'vitest';
import { canRoleAccessPath } from '@/lib/auth-routing';
import { filterPortalConfigForRole, financePortal } from '@/lib/navigation';

const path = '/finance/bank-reconciliation';

describe('bank reconciliation navigation', () => {
  it('is available to a scoped accounting operator', () => {
    const links = filterPortalConfigForRole(financePortal, ['Accountant'])
      .navGroups.flatMap((group) => group.items.map((item) => item.href));
    expect(links).toContain(path);
    expect(canRoleAccessPath(['Accountant'], path)).toBe(true);
  });

  it('does not grant a requester access', () => {
    const links = filterPortalConfigForRole(financePortal, ['Faculty'])
      .navGroups.flatMap((group) => group.items.map((item) => item.href));
    expect(links).not.toContain(path);
    expect(canRoleAccessPath(['Faculty'], path)).toBe(false);
  });
});
