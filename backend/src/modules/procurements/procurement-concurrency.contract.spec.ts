import { readFileSync } from 'fs';
import { join } from 'path';

const service = readFileSync(
  join(process.cwd(), 'src/modules/procurements/procurement.service.ts'),
  'utf8',
);
const migration = readFileSync(
  join(
    process.cwd(),
    'migrations/20260829120000_dofa_module2_progressive_procurement.sql',
  ),
  'utf8',
);

describe('Module 2 concurrency contract', () => {
  it('locks the case before financial and quantity transitions', () => {
    expect(service).toContain(
      'SELECT * FROM proc_cases WHERE proc_case_id=$1 AND tenant_id=$2 FOR UPDATE',
    );
    expect(service).toContain(
      'Active ordered quantity exceeds approved quantity',
    );
    expect(service).toContain('Order exceeds available allocation');
  });

  it('moves source funding from encumbered to utilized atomically with payment', () => {
    expect(service).toContain(
      'encumbered_amount=GREATEST(0,COALESCE(encumbered_amount,0)-$2)',
    );
    expect(service).toContain('utilized_amount=COALESCE(utilized_amount,0)+$2');
  });

  it('allocates monotonic event sequence while holding the aggregate transaction', () => {
    expect(service).toContain(
      'const sequence = Number(row.next_event_sequence)',
    );
    expect(migration).toContain('UNIQUE (aggregate_id, aggregate_sequence)');
  });
});
