import { readFileSync } from 'fs';
import { join } from 'path';

describe('DoFA Module 9 migration contract', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'migrations/20260905120000_dofa_module9_asset_retirement.sql',
    ),
    'utf8',
  );

  it('creates canonical retirement, sanitization, disposition and certificate records', () => {
    for (const table of [
      'retirement_cases',
      'retirement_allocations',
      'retirement_holds',
      'retirement_assessments',
      'retirement_financial_snapshots',
      'retirement_approval_snapshots',
      'retirement_sanitization_jobs',
      'retirement_disposal_lots',
      'retirement_offers',
      'retirement_awards',
      'retirement_custody_events',
      'retirement_finance_projections',
      'retirement_certificates',
      'retirement_outbox_events',
    ])
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
  });

  it('enforces one active allocation and cross-module retirement holds', () => {
    expect(sql).toContain('uq_retirement_active_allocation');
    expect(sql).toContain('uq_retirement_active_hold');
    expect(sql).toContain('retirement_guard_protected_mutation');
    expect(sql).toContain('tr_retirement_guard_inventory');
    expect(sql).toContain('tr_retirement_guard_returns');
    expect(sql).toContain('tr_retirement_guard_service');
    expect(sql).toContain('tr_retirement_guard_rfid');
    expect(sql).toContain('tr_retirement_guard_legacy_asset');
    expect(sql).toContain("current_setting('falcon.module9_case_id',true)");
  });

  it('keeps physical, Finance and sanitization status independent', () => {
    expect(sql).toContain('PHYSICAL_COMPLETED');
    expect(sql).toContain('FINANCE_PENDING');
    expect(sql).toContain('FINANCE_POSTING_FAILED');
    expect(sql).toContain('PHYSICAL_DESTRUCTION_REQUIRED');
  });

  it('seeds rollout flags disabled', () => {
    for (const flag of [
      'dofa_module9_asset_retirement',
      'dofa_module9_disposal_gate',
      'dofa_module9_sanitization_gate',
      'dofa_module9_controlled_auction',
    ])
      expect(sql).toContain(`'${flag}',false`);
  });
});
