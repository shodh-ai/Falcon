import { readFileSync } from 'fs';
import { join } from 'path';

describe('LMS independent-launch migration contract', () => {
  const sql = readFileSync(
    join(
      __dirname,
      '../../../migrations/20260916120000_lms_independent_launch.sql',
    ),
    'utf8',
  );

  it('catalogues LMS separately and persists acceptance evidence', () => {
    expect(sql).toContain("'lms_learning'");
    expect(sql).toContain('platform_module_readiness_evidence');
    expect(sql).toContain('idempotency_key');
    expect(sql).toContain("d.dept_id::text,'OFF'");
  });

  it('adds the concurrency constraints required by attempts and scope indexes', () => {
    expect(sql).toContain('uq_lms_attempt_answer_question');
    expect(sql).toContain('idx_lms_enrollment_scope');
    expect(sql).toContain('idx_lms_faculty_allocation_scope');
  });
});
