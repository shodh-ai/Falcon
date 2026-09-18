import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('GVMC QA vendor fixtures migration', () => {
  const migration = readFileSync(
    join(
      __dirname,
      '../../../migrations/20260918193000_gvmc_qa_vendors.sql',
    ),
    'utf8',
  );

  it('is tenant-scoped, idempotent, and uses non-contactable QA addresses', () => {
    expect(migration).toContain("lower(subdomain) = 'gvmc'");
    expect(migration.match(/@gvmc\.example\.invalid/g)).toHaveLength(3);
    expect(migration).toContain('ON CONFLICT (tenant_id, gstin) DO UPDATE');
    expect(migration).toContain(
      'ON CONFLICT (tenant_id, vendor_id, category) DO UPDATE',
    );
  });

  it('creates three compliant empanelled candidates with auditable evidence', () => {
    expect(migration.match(/GVMC QA .* Vendor'/g)).toHaveLength(6);
    expect(migration).toContain("'COMPLIANT'");
    expect(migration).toContain('is_empanelled = true');
    expect(migration).toContain('evidence_count = EXCLUDED.evidence_count');
  });
});
