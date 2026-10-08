import { readFileSync } from 'fs';
import { join } from 'path';
describe('DoFA Module 7 migration', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'migrations/20260903120000_dofa_module7_returns_doa.sql',
    ),
    'utf8',
  );
  it.each([
    'ret_cases',
    'ret_case_allocations',
    'ret_policy_snapshots',
    'ret_evidence',
    'ret_decisions',
    'ret_vendor_communications',
    'ret_rma_history',
    'ret_shipment_history',
    'ret_execution_projections',
    'ret_financial_projections',
    'ret_lineage',
    'ret_outbox_events',
    'proc_return_subject_allocations',
    'proc_financial_recovery_policies',
    'proc_financial_recoveries',
  ])('creates %s', (table) =>
    expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`),
  );
  it('pins structured historical vendor terms', () => {
    for (const column of [
      'return_window_days',
      'doa_window_days',
      'return_conditions',
      'replacement_conditions',
      'refund_conditions',
      'restocking_fee_policy',
      'return_shipping_responsibility',
      'policy_source_reference',
    ])
      expect(sql).toContain(column);
  });
  it('ships both rollout gates disabled', () => {
    expect(sql).toContain("'dofa_module7_returns',false");
    expect(sql).toContain("'dofa_module7_financial_recovery_gate',false");
  });
  it('conserves posted recovery', () =>
    expect(sql).toContain(
      'original_expenditure-posted_recovery+retained_charges=net_effective_expenditure',
    ));
});
