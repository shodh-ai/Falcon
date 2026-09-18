import { readFileSync } from 'fs';
import { join } from 'path';

describe('GVMC test funding repair migration', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'migrations',
      '20260918130000_gvmc_test_funding_limit.sql',
    ),
    'utf8',
  );

  it('targets only the named GVMC project test source', () => {
    expect(sql).toContain("lower(tenant.subdomain) = 'gvmc'");
    expect(sql).toContain("funding.funding_source_type = 'PROJECT'");
    expect(sql).toContain("funding.name = 'GVMC test funding source'");
  });

  it('raises the launch balance without reducing a larger allocation', () => {
    expect(sql).toContain(
      'GREATEST(funding.allocated_amount, 10000000)',
    );
  });
});
