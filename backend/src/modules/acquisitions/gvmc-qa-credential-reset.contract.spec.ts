import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('GVMC QA credential reset migration', () => {
  const migration = readFileSync(
    join(
      __dirname,
      '../../../migrations/20260918191000_reset_gvmc_qa_credentials.sql',
    ),
    'utf8',
  );

  it('is restricted to the GVMC tenant and the eleven dedicated QA accounts', () => {
    expect(migration).toContain("lower(subdomain) = 'gvmc'");
    expect(migration.match(/\.gvmc@mygyanvihar\.com'/g)).toHaveLength(11);
    expect(migration).toContain('IF v_updated <> 11 THEN');
  });

  it('reactivates the QA identities without storing plaintext credentials', () => {
    expect(migration).toContain("onboarding_status = 'COMPLETED'");
    expect(migration).toContain('is_active = true');
    expect(migration).toContain('deleted_at = NULL');
    expect(migration).not.toContain('GvmcQA!');
  });
});
