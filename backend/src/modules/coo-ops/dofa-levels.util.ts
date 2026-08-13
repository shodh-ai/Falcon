export type DofaLevel = {
  level_no: number;
  label: string;
  max_amount_inr: number | null;
  required_roles: string[];
  required_signatures: number;
};

/** Default five-level matrix when DB rows missing */
export const DEFAULT_DOFA_LEVELS: DofaLevel[] = [
  {
    level_no: 1,
    label: 'HOD / Lab Director',
    max_amount_inr: 50000,
    required_roles: ['HOD', 'LabAdmin'],
    required_signatures: 1,
  },
  {
    level_no: 2,
    label: 'Dean / Campus Director',
    max_amount_inr: 200000,
    required_roles: ['Dean', 'CampusAdmin'],
    required_signatures: 1,
  },
  {
    level_no: 3,
    label: 'Joint Committee',
    max_amount_inr: 500000,
    required_roles: ['ProcurementHead', 'FinanceController'],
    required_signatures: 2,
  },
  {
    level_no: 4,
    label: 'COO / VP Operations',
    max_amount_inr: 1500000,
    required_roles: ['COO'],
    required_signatures: 1,
  },
  {
    level_no: 5,
    label: 'Chairman / CEO',
    max_amount_inr: null,
    required_roles: ['Chairman', 'President'],
    required_signatures: 1,
  },
];

/** Lowest level whose max covers amount (Level 5 if above all caps). */
export function resolveDofaLevel(
  amount: number,
  levels: DofaLevel[] = DEFAULT_DOFA_LEVELS,
): DofaLevel {
  const sorted = [...levels].sort((a, b) => a.level_no - b.level_no);
  for (const level of sorted) {
    if (
      level.max_amount_inr == null ||
      amount <= Number(level.max_amount_inr)
    ) {
      return level;
    }
  }
  return sorted[sorted.length - 1];
}

export function pendingStatusForLevel(levelNo: number): string {
  return `PENDING_L${levelNo}`;
}

/** CFO signs as FinanceController for L3 joint committee; other roles pass through. */
export function normalizeDofaSignerRole(roleName: string): string {
  const r = String(roleName || '').toLowerCase();
  if (r === 'cfo') return 'financecontroller';
  return r;
}

export function roleCanSignLevel(roleName: string, level: DofaLevel): boolean {
  const normalized = normalizeDofaSignerRole(roleName);
  const raw = String(roleName || '').toLowerCase();
  return level.required_roles.some((x) => {
    const need = x.toLowerCase();
    return need === raw || normalizeDofaSignerRole(x) === normalized;
  });
}

/** Distinct signer slots satisfied (aliases collapse). */
export function dualSignSlotsSatisfied(
  level: DofaLevel,
  signedRoles: string[],
  distinctUserCount: number,
): { ok: boolean; awaiting: string[] } {
  const need = [
    ...new Set(level.required_roles.map((r) => normalizeDofaSignerRole(r))),
  ];
  const have = new Set(signedRoles.map((r) => normalizeDofaSignerRole(r)));
  const awaiting = need.filter((r) => !have.has(r));
  const ok =
    awaiting.length === 0 && distinctUserCount >= level.required_signatures;
  return { ok, awaiting };
}
