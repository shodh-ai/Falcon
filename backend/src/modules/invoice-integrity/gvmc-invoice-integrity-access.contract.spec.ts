import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('GVMC invoice-integrity analyzer access', () => {
  const migration = readFileSync(
    join(
      __dirname,
      '../../../migrations/20260919124500_gvmc_invoice_integrity_analyzer.sql',
    ),
    'utf8',
  );
  const provisioning = readFileSync(
    join(__dirname, '../../../scripts/provision-gvmc-finance.js'),
    'utf8',
  );

  it('assigns analysis to the procurement reviewer only in the GVMC tenant', () => {
    expect(migration).toContain("lower(tenant.subdomain) = 'gvmc'");
    expect(migration).toContain(
      "lower(qa_user.official_email) = 'procurement-review.gvmc@mygyanvihar.com'",
    );
    expect(migration).toContain("'INVOICE_INTEGRITY_ANALYZE'");
    expect(migration).toContain("'TENANT'");
  });

  it('keeps the grant idempotent and preserves the provisioning baseline', () => {
    expect(migration).toContain('WHERE NOT EXISTS');
    expect(provisioning).toContain("'INVOICE_INTEGRITY_ANALYZE'");
    expect(provisioning).toContain("'INVOICE_INTEGRITY_CERTIFY'");
  });
});
