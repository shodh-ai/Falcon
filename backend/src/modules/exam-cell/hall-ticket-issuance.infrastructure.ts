import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { DataSource, EntityManager } from 'typeorm';
import { ExamCellAuditService } from './exam-cell-audit.service';

export type HallTicketPersistenceScope = {
  tenant: string;
  student: string;
  actor: string;
  session: string;
  window: string;
  registration: string;
  approval: string;
};

/**
 * Persistence primitive ONLY; intentionally not a Nest provider or controller.
 * No approval, readiness, PDF generation or authority to issue is supplied here.
 * A future authorized writer must enforce the policy guard and revalidate all
 * prerequisites inside work(). An existing_record result is NOT download authority
 * or issuance success: work() is not called for it. The future orchestration must
 * separately revalidate that record before accepting a retry as successful.
 *
 * Recovery: use create-only, server-generated object keys. Never delete on a
 * transaction exception: a lost COMMIT acknowledgement may mean it committed.
 * Retry under these same locks to inspect the unique issued record. Retain any
 * unreferenced private object for reconciliation; automatic garbage collection
 * requires durable attempt ownership and an approved retention/recovery design.
 */
export class HallTicketIssuanceInfrastructure {
  constructor(
    private readonly db: DataSource,
    private readonly audit: ExamCellAuditService,
  ) {}

  async transaction<T>(
    scope: HallTicketPersistenceScope,
    work: (manager: EntityManager) => Promise<T>,
  ) {
    if (
      !(
        [
          'tenant',
          'student',
          'actor',
          'session',
          'window',
          'registration',
          'approval',
        ] as const
      ).every((key) => typeof scope?.[key] === 'string' && isUUID(scope[key]))
    )
      throw new BadRequestException(
        'Valid Hall Ticket persistence scope required',
      );
    try {
      return await this.db.transaction(async (manager) => {
        // Same parent-before-child order used by registration and retrieval.
        // Exclusive session locking serializes competing writers even when no
        // issued entry yet exists. The unique index also protects other writers.
        const locks: Array<[string, unknown[]]> = [
          [
            'SELECT session_id FROM exam_sessions WHERE tenant_id=$1 AND session_id=$2 FOR UPDATE',
            [scope.tenant, scope.session],
          ],
          [
            'SELECT window_id FROM exam_form_windows WHERE tenant_id=$1 AND session_id=$2 AND window_id=$3 AND semester=(SELECT semester FROM exam_sessions WHERE session_id=$2 AND tenant_id=$1) FOR SHARE',
            [scope.tenant, scope.session, scope.window],
          ],
          [
            'SELECT registration_id FROM exam_semester_registrations WHERE tenant_id=$1 AND session_id=$2 AND window_id=$3 AND student_user_id=$4 AND registration_id=$5 AND semester=(SELECT semester FROM exam_sessions WHERE session_id=$2 AND tenant_id=$1) FOR UPDATE',
            [
              scope.tenant,
              scope.session,
              scope.window,
              scope.student,
              scope.registration,
            ],
          ],
          [
            'SELECT approval_id FROM hall_ticket_approvals WHERE tenant_id=$1 AND session_id=$2 AND student_user_id=$3 AND registration_id=$4 AND approval_id=$5 FOR UPDATE',
            [
              scope.tenant,
              scope.session,
              scope.student,
              scope.registration,
              scope.approval,
            ],
          ],
        ];
        for (const [sql, args] of locks) {
          const rows = await manager.query<unknown[]>(sql, args);
          if (rows.length !== 1)
            throw new NotFoundException(
              'Hall Ticket persistence scope unavailable',
            );
        }
        const actors = await manager.query<unknown[]>(
          'SELECT user_id FROM users WHERE tenant_id=$1 AND user_id=ANY($2::uuid[]) AND is_active=true AND deleted_at IS NULL ORDER BY user_id FOR SHARE',
          [scope.tenant, [...new Set([scope.actor, scope.student])]],
        );
        if (actors.length !== new Set([scope.actor, scope.student]).size)
          throw new NotFoundException('Hall Ticket actor unavailable');
        const existing = await manager.query<Array<{ entry_id: string }>>(
          'SELECT entry_id FROM exam_admit_card_entries WHERE tenant_id=$1 AND student_user_id=$2 AND session_id=$3 AND issued_at IS NOT NULL ORDER BY entry_id FOR UPDATE',
          [scope.tenant, scope.student, scope.session],
        );
        if (existing.length > 1)
          throw new ConflictException(
            'Ambiguous issued records require reconciliation',
          );
        if (existing.length)
          return {
            kind: 'existing_record' as const,
            entry_id: existing[0].entry_id,
          };
        const value = await work(manager);
        await this.audit.log(
          scope.tenant,
          scope.actor,
          {
            action: 'HALL_TICKET_ISSUANCE_TRANSACTION',
            resource_type: 'exam_session',
            resource_id: scope.session,
          },
          manager,
        );
        return { kind: 'transaction_committed' as const, value };
      });
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === '23505' &&
        'constraint' in error &&
        error.constraint === 'uq_hall_issued_student_session'
      )
        throw new ConflictException(
          'An issued record already exists; retry scoped reconciliation',
        );
      throw error;
    }
  }
}
