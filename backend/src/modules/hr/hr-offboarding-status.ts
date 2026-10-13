/** Shared offboarding queue definitions used by the dashboard and case list. */
export function pendingFnfClearanceSql(alias: 'r' | 'rr'): string {
  return `${alias}.status = 'FNF_PENDING'
    AND COALESCE(${alias}.exit_status, 'PENDING_CLEARANCE') <> 'OFFBOARDED'`;
}

export function awaitingHrActionSql(alias: 'r' | 'rr'): string {
  return `${alias}.status IN ('PENDING_HR', 'HOD_CLEARED', 'HR_PROCESSING', 'FNF_PENDING')
    AND COALESCE(${alias}.exit_status, 'PENDING_CLEARANCE') <> 'OFFBOARDED'`;
}

export function fnfToInitiateSql(alias: 'r' | 'rr'): string {
  return `${alias}.status IN ('PENDING_HR', 'HOD_CLEARED', 'HR_PROCESSING')
    AND COALESCE(${alias}.exit_status, 'PENDING_CLEARANCE') <> 'OFFBOARDED'`;
}

export function completedExitSql(alias: 'r' | 'rr'): string {
  return `${alias}.exit_status = 'OFFBOARDED'
    AND ${alias}.status IN ('FNF_PENDING', 'FNF_COMPLETED')`;
}
