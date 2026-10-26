import type { EntityManager } from 'typeorm';

/** Marks are shared by course/exam type, even across result-session semesters. */
export async function lockResultInputs(
  manager: EntityManager,
  tenantId: string,
  courseId: string,
  examType: string,
): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    JSON.stringify(['result-input', tenantId, courseId, examType]),
  ]);
}
