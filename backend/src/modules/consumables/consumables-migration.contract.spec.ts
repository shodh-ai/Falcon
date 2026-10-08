import { readFileSync } from 'fs';
import { join } from 'path';

describe('DoFA Module 6 migration', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'migrations/20260902120000_dofa_module6_consumables_operations.sql',
    ),
    'utf8',
  );
  it.each([
    'con_stock_requests',
    'con_reservations',
    'con_reservation_allocations',
    'con_issues',
    'con_custody_events',
    'con_count_sessions',
    'con_lot_eligibility',
    'con_alerts',
    'con_replenishment_suggestions',
    'con_outbox_events',
  ])('creates %s', (table) =>
    expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`),
  );
  it('ships disabled rollout flags', () => {
    expect(sql).toContain("'dofa_module6_consumables',false");
    expect(sql).toContain("'dofa_module6_replenishment',false");
  });
  it('allows replenishment drafts without bypassing Module 1', () =>
    expect(sql).toContain("'INVENTORY_REPLENISHMENT'"));
});
