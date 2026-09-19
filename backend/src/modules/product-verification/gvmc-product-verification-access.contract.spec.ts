import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('GVMC product-verification analyzer access', () => {
  const migration = readFileSync(
    join(
      __dirname,
      '../../../migrations/20260919131500_gvmc_product_verification_analyzer.sql',
    ),
    'utf8',
  );
  const provisioning = readFileSync(
    join(__dirname, '../../../scripts/provision-gvmc-finance.js'),
    'utf8',
  );

  it('assigns deterministic analysis to the procurement reviewer', () => {
    expect(migration).toContain("lower(tenant.subdomain) = 'gvmc'");
    expect(migration).toContain(
      "lower(qa_user.official_email) = 'procurement-review.gvmc@mygyanvihar.com'",
    );
    expect(migration).toContain("'PRODUCT_VERIFICATION_ANALYZE'");
    expect(migration).toContain('WHERE NOT EXISTS');
    expect(provisioning).toContain("'PRODUCT_VERIFICATION_ANALYZE'");
  });

  it('keeps human review with the independent inventory verifier', () => {
    expect(provisioning).toContain("'PRODUCT_VERIFICATION_REVIEW'");
    expect(provisioning).toContain("role: 'InventoryVerifier'");
  });
});
