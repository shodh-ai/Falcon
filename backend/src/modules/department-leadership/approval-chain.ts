import { BadRequestException } from '@nestjs/common';

export type LeadershipChain = {
  deptId: number;
  revision: number;
  approverIds: string[];
};

/** Reassign only unfinished stages; retain one explicit confirmation if the
 *  shortened chain would otherwise finalize a pending request by itself. */
export function remainingLeadershipApprovers(
  nextChain: string[], completedStageCount: number, approvedActors: string[],
): string[] {
  const completed = new Set(approvedActors);
  const remaining = nextChain.slice(Math.max(0, completedStageCount))
    .filter((id) => !completed.has(id));
  if (!remaining.length && nextChain.length) remaining.push(nextChain[nextChain.length - 1]);
  return remaining;
}

/** Resolve live, tenant-scoped appointments. No role label grants approval power. */
export async function resolveLeadershipChain(
  query: (sql: string, args: unknown[]) => Promise<Array<Record<string, any>>>,
  tenantId: string,
  requesterId: string,
  lockConfig = false,
): Promise<LeadershipChain | null> {
  const rows = await query(
    `SELECT c.dept_id,c.revision,c.structure,c.dean_enabled,
      (SELECT dean.user_id FROM users dean WHERE dean.tenant_id=c.tenant_id
       AND dean.user_id=c.dean_user_id AND dean.is_active=true AND dean.deleted_at IS NULL)
        AS dean_user_id,
      (SELECT higher.user_id FROM users higher WHERE higher.tenant_id=c.tenant_id
       AND higher.user_id=c.higher_officer_id AND higher.is_active=true AND higher.deleted_at IS NULL)
        AS higher_officer_id,
      (SELECT a.user_id FROM department_offices o
       JOIN department_office_appointments a ON a.office_id=o.office_id
         AND a.valid_to IS NULL AND a.valid_from<=now()
       JOIN users holder ON holder.user_id=a.user_id AND holder.tenant_id=o.tenant_id
         AND holder.is_active=true AND holder.deleted_at IS NULL
       WHERE o.tenant_id=c.tenant_id AND o.dept_id=c.dept_id AND o.kind='HOD'
       LIMIT 1) AS hod_user_id,
      (SELECT a.user_id FROM department_offices o
       JOIN department_office_appointments a ON a.office_id=o.office_id
         AND a.valid_to IS NULL AND a.valid_from<=now()
       JOIN users holder ON holder.user_id=a.user_id AND holder.tenant_id=o.tenant_id
         AND holder.is_active=true AND holder.deleted_at IS NULL
       WHERE o.tenant_id=c.tenant_id AND o.dept_id=c.dept_id AND o.kind='PRINCIPAL'
       LIMIT 1) AS principal_user_id
     FROM users requester
     JOIN department_leadership c ON c.tenant_id=requester.tenant_id
       AND c.dept_id=requester.dept_id
     WHERE requester.tenant_id=$1 AND requester.user_id=$2
       AND requester.is_active=true AND requester.deleted_at IS NULL
       ${lockConfig ? 'FOR SHARE OF c' : ''}`,
    [tenantId, requesterId],
  );
  const row = rows[0];
  if (!row) return null;
  const hod = row.structure === 'HOD_ONLY' || row.structure === 'PRINCIPAL_HOD'
    ? row.hod_user_id : null;
  const principal = row.structure === 'PRINCIPAL_ONLY' || row.structure === 'PRINCIPAL_HOD'
    ? row.principal_user_id : null;
  const dean = row.dean_enabled ? row.dean_user_id : null;
  if ((row.structure !== 'NONE' && !hod && !principal) || (row.dean_enabled && !dean)) {
    throw new BadRequestException('Department leadership has an unfilled enabled office');
  }
  // Routine cases stop at Principal, or HOD when there is no Principal.
  // Dean is a decision maker only for an uncovered office or a leader's own case.
  let candidates: Array<string | null>;
  if (requesterId === dean) candidates = [row.higher_officer_id];
  else if (requesterId === principal) candidates = [dean || row.higher_officer_id];
  else if (requesterId === hod) candidates = principal ? [principal] : [dean || row.higher_officer_id];
  else candidates = hod || principal ? [hod, principal] : [dean || row.higher_officer_id];
  const approverIds = [...new Set(candidates.filter((id): id is string => !!id && id !== requesterId))];
  if (!approverIds.length) {
    throw new BadRequestException('No independent reporting officer is configured for this staff member');
  }
  return { deptId: Number(row.dept_id), revision: Number(row.revision), approverIds };
}
