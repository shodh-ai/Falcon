import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('GVMC asset-service maker-checker access', () => {
  const migration = readFileSync(
    join(
      __dirname,
      '../../../migrations/20260919170000_gvmc_asset_service_maker_checker.sql',
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

  it('keeps review, execution, and acceptance on distinct users', () => {
    const reviewer = persona('procurement-review', 'budget-integrity');
    const technician = persona('receiving-stores', 'inventory-verifier');
    const acceptor = persona('hod', 'college-approver');

    expect(reviewer).toContain("'ASSET_SERVICE_TRIAGE'");
    expect(reviewer).toContain("'ASSET_SERVICE_ASSIGN'");
    expect(reviewer).toContain("'ASSET_SERVICE_WARRANTY_REVIEW'");
    expect(reviewer).not.toContain("'ASSET_SERVICE_EXECUTE'");
    expect(reviewer).not.toContain("'ASSET_SERVICE_ACCEPT'");

    expect(technician).toContain("'ASSET_SERVICE_EXECUTE'");
    expect(technician).not.toContain("'ASSET_SERVICE_ACCEPT'");

    expect(acceptor).toContain("'ASSET_SERVICE_ACCEPT'");
    expect(acceptor).not.toContain("'ASSET_SERVICE_EXECUTE'");
  });

  it('uses a separate college approver for warranty exceptions', () => {
    const reviewer = persona('procurement-review', 'budget-integrity');
    const exceptionApprover = persona(
      'college-approver',
      'procurement-operator',
    );

    expect(reviewer).toContain("'ASSET_SERVICE_WARRANTY_REVIEW'");
    expect(exceptionApprover).toContain(
      "'ASSET_SERVICE_WARRANTY_EXCEPTION'",
    );
    expect(migration).toContain(
      "'college-approver.gvmc@mygyanvihar.com', 'ASSET_SERVICE_WARRANTY_EXCEPTION'",
    );
    expect(migration).toContain(
      "'receiving-stores.gvmc@mygyanvihar.com', 'ASSET_SERVICE_EXECUTE'",
    );
  });
});
