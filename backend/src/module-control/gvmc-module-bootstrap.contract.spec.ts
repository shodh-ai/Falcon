import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('GVMC module-state compatibility bootstrap', () => {
  const migration = readFileSync(
    join(
      __dirname,
      '../../migrations/20261001150000_bootstrap_gvmc_module_states.sql',
    ),
    'utf8',
  );

  it('seeds only missing tenant-level rows for GVMC', () => {
    expect(migration).toContain("lower(t.subdomain) = 'gvmc'");
    expect(migration).toContain("'finance_procurement'");
    expect(migration).toContain("'TENANT'");
    expect(migration).toContain("'ACTIVE'");
    expect(migration).toContain(
      'ON CONFLICT (module_key, tenant_id, scope_type, scope_id) DO NOTHING',
    );
  });

  it('only writes launch-control state rows', () => {
    expect(migration).not.toMatch(/UPDATE\s+users|DELETE\s+FROM/i);
  });
});
