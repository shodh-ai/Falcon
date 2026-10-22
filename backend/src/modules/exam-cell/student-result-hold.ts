import { ForbiddenException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

/** Match the existing grade-card/transcript hold while a UFM case is open. */
export async function assertStudentResultsAvailable(
  db: Pick<EntityManager, 'query'>,
  tenantId: string,
  studentUserId: string,
): Promise<void> {
  const rows = await db.query<Array<{ has_open_ufm: boolean }>>(
    `SELECT EXISTS (SELECT 1 FROM ufm_cases
     WHERE tenant_id=$1 AND student_user_id=$2 AND status<>'CLOSED') AS has_open_ufm`,
    [tenantId, studentUserId],
  );
  if (rows[0]?.has_open_ufm) {
    throw new ForbiddenException(
      'Published results are withheld while an open UFM case is under review. Contact the Examination Cell.',
    );
  }
}
