import { readFileSync } from 'fs';
import { join } from 'path';

describe('DoFA Module 8 migration', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'migrations/20260904120000_dofa_module8_asset_service.sql',
    ),
    'utf8',
  );
  it.each([
    'svc_cases',
    'svc_asset_holds',
    'svc_custody_history',
    'svc_warranty_entitlements',
    'svc_contracts',
    'svc_coverage_snapshots',
    'svc_preventive_policies',
    'svc_preventive_schedules',
    'svc_diagnoses',
    'svc_estimate_revisions',
    'svc_tasks',
    'svc_parts_usage',
    'svc_evidence',
    'svc_reverification_projections',
    'svc_acceptance_decisions',
    'svc_financial_projections',
    'svc_outbox_events',
  ])('creates %s', (table) =>
    expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`),
  );
  it('enforces one active service execution', () =>
    expect(sql).toContain('uq_svc_active_asset_execution'));
  it('protects closed and append-only records', () => {
    expect(sql).toContain('ASSET_SERVICE_CLOSED_IMMUTABLE');
    expect(sql).toContain('ASSET_SERVICE_IMMUTABLE');
  });
  it('ships all rollout gates disabled', () => {
    expect(sql).toContain("'dofa_module8_asset_service',false");
    expect(sql).toContain("'dofa_module8_preventive_maintenance',false");
    expect(sql).toContain("'dofa_module8_service_gate',false");
  });
});
