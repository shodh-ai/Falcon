import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Examination Cell tenant migration', () => {
  it('is schema/backfill only and has no demo fixture inserts', () => {
    const sql = readFileSync(
      join(
        __dirname,
        '../../../migrations/20261016120000_exam_application_tenant_scope.sql',
      ),
      'utf8',
    );
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS tenant_id/i);
    expect(sql).toMatch(/UPDATE exam_applications/i);
    expect(sql).toMatch(/orphan rows remain/i);
    expect(sql).toMatch(/tenant mismatch exists/i);
    expect(sql).toMatch(/student references are orphaned/i);
    expect(sql).toMatch(/fk_exam_applications_tenant/i);
    expect(sql).toMatch(/fk_academic_exam_results_tenant/i);
    expect(sql).toMatch(/ALTER COLUMN tenant_id SET NOT NULL/i);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS/i);
    expect(sql).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i);
  });

  it('repairs the result-session identity required by the upsert service', () => {
    const sql = readFileSync(
      join(
        __dirname,
        '../../../migrations/20261017100000_exam_result_session_identity.sql',
      ),
      'utf8',
    );
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS/i);
    expect(sql).toMatch(/tenant_id, course_id, exam_type, semester/i);
    expect(sql).toMatch(/duplicate tenant\/course\/exam\/semester/i);
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i);
  });
});
