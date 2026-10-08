import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('GVMC Module 9 maker-checker provisioning', () => {
  const migration = readFileSync(
    join(
      __dirname,
      '../../../migrations/20260919183000_gvmc_asset_retirement_maker_checker.sql',
    ),
    'utf8',
  );
  const provisioner = readFileSync(
    join(__dirname, '../../../scripts/provision-gvmc-finance.js'),
    'utf8',
  );

  it('gives G08 the execution capabilities needed after approval', () => {
    for (const capability of [
      'ASSET_RETIREMENT_VIEW',
      'ASSET_SANITIZATION_EXECUTE',
      'ASSET_DISPOSAL_PREPARE',
      'ASSET_DISPOSAL_EXECUTE',
    ]) {
      expect(migration).toContain(
        `('receiving-stores.gvmc@mygyanvihar.com', '${capability}')`,
      );
      expect(provisioner).toContain(`'${capability}'`);
    }
  });

  it('gives G09 independent verification and acceptance, never execution', () => {
    for (const capability of [
      'ASSET_RETIREMENT_VIEW',
      'ASSET_SANITIZATION_VERIFY',
      'ASSET_DISPOSAL_ACCEPT',
    ]) {
      expect(migration).toContain(
        `('inventory-verifier.gvmc@mygyanvihar.com', '${capability}')`,
      );
    }
    const verifierBlock = provisioner.match(
      /slug: 'inventory-verifier',[\s\S]*?\n  },/,
    )?.[0];
    expect(verifierBlock).toContain("'ASSET_SANITIZATION_VERIFY'");
    expect(verifierBlock).toContain("'ASSET_DISPOSAL_ACCEPT'");
    expect(verifierBlock).not.toContain("'ASSET_SANITIZATION_EXECUTE'");
    expect(verifierBlock).not.toContain("'ASSET_DISPOSAL_EXECUTE'");
  });
});
