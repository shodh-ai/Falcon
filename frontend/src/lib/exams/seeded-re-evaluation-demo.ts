/**
 * These exact SMOKE101 IDs are created by
 * backend/migrations/20260728200000_exam_cell_demo_completion_smoke.sql.
 * Keep the incomplete examples readable without offering academic mutations.
 * This display policy supplies no result provenance or assumed maximum marks;
 * backend official-result verification remains authoritative.
 */
const readOnlyDemoIds = new Set([
  'a1000002-0000-4000-8000-000000000002',
  'a1000003-0000-4000-8000-000000000003',
]);

export function isReadOnlySeededReEvaluation(record: {
  exam_application_id: string;
  subject_code: string;
} | null | undefined): boolean {
  return Boolean(record && record.subject_code === 'SMOKE101'
    && readOnlyDemoIds.has(record.exam_application_id.toLowerCase()));
}
