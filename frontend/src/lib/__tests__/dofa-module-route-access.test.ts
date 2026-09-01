import { describe, expect, it } from 'vitest';

import {
  DOFA_FINANCE_MODULE_PATH_ROLES,
  canRoleAccessPath,
} from '@/lib/auth-routing';
import { getFinancePortalRedirect } from '@/lib/dofa-portal-routes';
import { financePortal } from '@/lib/navigation';

const normalize = (roles: readonly string[]) => roles.map((role) => role.toLowerCase()).sort();

function financeNavItem(path: string) {
  return financePortal.navGroups
    .flatMap((group) => group.items)
    .find((item) => item.href === path);
}

describe('DoFA module route authorization', () => {
  it('keeps every visible Modules 1-9/X persona aligned with RoleGate and redirects', () => {
    for (const [path, allowedRoles] of Object.entries(DOFA_FINANCE_MODULE_PATH_ROLES)) {
      const item = financeNavItem(path);
      expect(item, `${path} should exist in Finance navigation`).toBeDefined();
      expect(normalize(item?.roles ?? [])).toEqual(normalize(allowedRoles));

      for (const role of item?.roles ?? []) {
        expect(canRoleAccessPath(role, path), `${role} should access ${path}`).toBe(true);
        expect(canRoleAccessPath(role, `${path}/test-id`), `${role} should access details`).toBe(true);
        expect(getFinancePortalRedirect(role, path), `${role} should not be redirected`).toBeNull();
      }
    }
  });

  it('allows P03 ProcurementBuyer into Modules 1 and 2', () => {
    expect(canRoleAccessPath('ProcurementBuyer', '/finance/acquisitions')).toBe(true);
    expect(canRoleAccessPath('ProcurementBuyer', '/finance/procurements')).toBe(true);
    expect(getFinancePortalRedirect('ProcurementBuyer', '/finance/acquisitions')).toBeNull();
    expect(getFinancePortalRedirect('ProcurementBuyer', '/finance/procurements')).toBeNull();
  });

  it('supports specialist module personas without granting unrelated modules', () => {
    expect(canRoleAccessPath('InventoryVerifier', '/finance/inventory')).toBe(true);
    expect(canRoleAccessPath('InventoryVerifier', '/finance/physical-identity')).toBe(true);
    expect(canRoleAccessPath('ServiceTechnician', '/finance/asset-service')).toBe(true);
    expect(canRoleAccessPath('ExternalServiceProvider', '/finance/asset-service')).toBe(true);
    expect(canRoleAccessPath('SanitizationOperator', '/finance/asset-retirement')).toBe(true);
    expect(canRoleAccessPath('SanitizationVerifier', '/finance/asset-retirement')).toBe(true);
    expect(canRoleAccessPath('ServiceTechnician', '/finance/acquisitions')).toBe(false);
    expect(canRoleAccessPath('SanitizationOperator', '/finance/asset-service')).toBe(false);
  });

  it('denies unrelated and anonymous users across every DoFA module route', () => {
    for (const path of Object.keys(DOFA_FINANCE_MODULE_PATH_ROLES)) {
      expect(canRoleAccessPath('Student', path)).toBe(false);
      expect(canRoleAccessPath(undefined, path)).toBe(false);
    }
  });
});
