import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

/** The month is the request's submission month in the university's local time.
 * Only final approvals consume a slot. Call inside the decision transaction,
 * before updating the request, so concurrent approvals share the same lock.
 */
export async function assertWorkforceMonthlyApprovalLimit(
  manager: EntityManager,
  tenantId: string,
  staffId: string,
  leaveId: string,
): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))',
    [`${tenantId}:${staffId}:workforce-monthly-approvals`]);
  const [usage] = await manager.query<Array<{
    regularizations: number; reconsiderations: number;
    is_regularization: boolean; is_reconsideration: boolean;
  }>>(`SELECT r.request_type='REGULARIZATION' AS is_regularization,
      (r.request_type='LEAVE' AND a.status='PENDING_FINAL') IS TRUE AS is_reconsideration,
      (SELECT count(*)::int FROM staff_leave_requests approved
       WHERE approved.tenant_id=r.tenant_id AND approved.staff_user_id=r.staff_user_id
         AND approved.leave_id<>r.leave_id AND approved.request_type='REGULARIZATION'
         AND approved.status='HR_APPROVED'
         AND date_trunc('month',approved.applied_at AT TIME ZONE 'Asia/Kolkata')=
             date_trunc('month',r.applied_at AT TIME ZONE 'Asia/Kolkata')) AS regularizations,
      (SELECT count(*)::int FROM hr_staff_request_appeals approved
       JOIN staff_leave_requests request ON request.tenant_id=approved.tenant_id
         AND request.leave_id=approved.leave_id AND request.request_type='LEAVE'
       WHERE approved.tenant_id=r.tenant_id AND approved.requester_user_id=r.staff_user_id
         AND approved.leave_id<>r.leave_id AND approved.status='APPROVED'
         AND date_trunc('month',approved.created_at AT TIME ZONE 'Asia/Kolkata')=
             date_trunc('month',a.created_at AT TIME ZONE 'Asia/Kolkata')) AS reconsiderations
    FROM staff_leave_requests r
    LEFT JOIN hr_staff_request_appeals a ON a.tenant_id=r.tenant_id AND a.leave_id=r.leave_id
    WHERE r.tenant_id=$1 AND r.staff_user_id=$2 AND r.leave_id=$3`,
  [tenantId, staffId, leaveId]);
  if (!usage) throw new ConflictException('Request is no longer available; refresh before approving');
  if (usage.is_regularization && Number(usage.regularizations) >= 3)
    throw new ConflictException('This employee already has 3 approved regularization requests for the submission month. Pending and rejected requests do not count.');
  if (usage.is_reconsideration && Number(usage.reconsiderations) >= 3)
    throw new ConflictException('This employee already has 3 approved leave reconsiderations for the appeal submission month. Pending and rejected appeals do not count.');
}
