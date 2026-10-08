import { readFileSync } from 'fs';
import { join } from 'path';

describe('Invoice integrity QA persona contract', () => {
  const seed = readFileSync(
    join(
      process.cwd(),
      'migrations',
      '20260907120000_dofa_qa_personas.seed.sql',
    ),
    'utf8',
  );

  it('seeds a dedicated analyst who is not the invoice entrant', () => {
    expect(seed).toContain('qa.dofa.p47.integrity-analyst@mygyanvihar.test');
    expect(seed).toMatch(
      /"code":"P47"[^\n]+"INVOICE_INTEGRITY_ANALYZE"[^\n]+"INVOICE_INTEGRITY_INVESTIGATE"/,
    );
  });

  it('seeds a distinct independent certifier', () => {
    expect(seed).toContain('qa.dofa.p48.integrity-certifier@mygyanvihar.test');
    expect(seed).toMatch(
      /"code":"P48"[^\n]+"INVOICE_INTEGRITY_CERTIFY"/,
    );
    expect(seed).not.toMatch(
      /"code":"P48"[^\n]+"INVOICE_INTEGRITY_INVESTIGATE"/,
    );
  });
});
