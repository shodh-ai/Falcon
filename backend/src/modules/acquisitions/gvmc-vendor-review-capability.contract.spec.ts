import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('GVMC vendor-review capability migration', () => {
  const migration = readFileSync(
    join(
      __dirname,
      '../../../migrations/20261001160000_gvmc_acquisition_vendor_review.sql',
    ),
    'utf8',
  );

  it('is limited to the dedicated GVMC procurement reviewer', () => {
    expect(migration).toContain("lower(tenant.subdomain) = 'gvmc'");
    expect(migration).toContain(
      "lower(qa_user.official_email) = 'procurement-review.gvmc@mygyanvihar.com'",
    );
    expect(migration).toContain("'ACQUISITION_VENDOR_REVIEW'");
    expect(migration).toContain("'TENANT'");
    expect(migration).not.toContain('procurement-operator.gvmc@mygyanvihar.com');
  });

  it('is idempotent and does not broaden the grant scope', () => {
    expect(migration).toContain('WHERE NOT EXISTS');
    expect(migration).toContain('existing.valid_until IS NULL');
    expect(migration).toContain('existing.scope_reference IS NULL');
  });
});
