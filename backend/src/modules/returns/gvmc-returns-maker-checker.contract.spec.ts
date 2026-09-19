import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('GVMC returns and inventory maker-checker access', () => {
  const migration = readFileSync(
    join(
      __dirname,
      '../../../migrations/20260919155000_gvmc_returns_inventory_maker_checker.sql',
    ),
    'utf8',
  );
  const provisioning = readFileSync(
    join(__dirname, '../../../scripts/provision-gvmc-finance.js'),
    'utf8',
  );

  const persona = (slug: string, nextSlug: string) => {
    const start = provisioning.indexOf(`slug: '${slug}'`);
    const end = provisioning.indexOf(`slug: '${nextSlug}'`, start + 1);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return provisioning.slice(start, end);
  };

  it('separates return eligibility review from disposition approval', () => {
    const reviewer = persona('procurement-review', 'budget-integrity');
    const approver = persona('college-approver', 'procurement-operator');

    expect(reviewer).toContain("'RETURNS_ELIGIBILITY_REVIEW'");
    expect(reviewer).not.toContain("'RETURNS_APPROVE'");
    expect(approver).toContain("'RETURNS_APPROVE'");
    expect(migration).toContain(
      "'college-approver.gvmc@mygyanvihar.com', 'RETURNS_APPROVE'",
    );
    expect(migration).toContain(
      "lower(qa_user.official_email) = 'procurement-review.gvmc@mygyanvihar.com'",
    );
    expect(migration).toContain("grant_row.capability = 'RETURNS_APPROVE'");
  });

  it('provides a distinct inventory transfer acknowledger', () => {
    const operator = persona('receiving-stores', 'inventory-verifier');
    const verifier = persona('inventory-verifier', 'auditor');

    expect(operator).toContain("'INVENTORY_TRANSFER'");
    expect(verifier).toContain("'INVENTORY_TRANSFER'");
    expect(migration).toContain(
      "'inventory-verifier.gvmc@mygyanvihar.com', 'INVENTORY_TRANSFER'",
    );
  });
});
