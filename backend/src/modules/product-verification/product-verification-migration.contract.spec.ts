import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(
  join(
    process.cwd(),
    'migrations',
    '20260831120000_dofa_module4_product_verification.sql',
  ),
  'utf8',
);

describe('Module 4 migration contract', () => {
  it.each([
    'pv_geofence_policies',
    'pv_verification_policies',
    'pv_cases',
    'pv_subjects',
    'pv_invoice_allocations',
    'pv_reference_snapshots',
    'pv_capture_exceptions',
    'pv_capture_sessions',
    'pv_evidence',
    'pv_analyses',
    'pv_attribute_comparisons',
    'pv_blockers',
    'pv_blocker_resolutions',
    'pv_review_recommendations',
    'pv_decisions',
    'pv_verification_identities',
    'pv_inventory_identity_projections',
    'pv_audit_events',
    'pv_outbox_events',
  ])('creates first-class table %s', (table) => {
    expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  });

  it('models individual items, lots, and revocable identities', () => {
    expect(sql).toContain("subject_type IN ('ITEM','LOT')");
    expect(sql).toContain("subject_type='ITEM' AND subject_quantity=1");
    expect(sql).toContain(
      "status IN ('ACTIVE','REVOKED','SUPERSEDED','EXPIRED')",
    );
    expect(sql).toContain("signature_algorithm='Ed25519'");
  });

  it('preserves evidence, analysis, decisions, and audit as append-only facts', () => {
    expect(sql).toContain('tr_pv_evidence_immutable');
    expect(sql).toContain('tr_pv_analysis_immutable');
    expect(sql).toContain('tr_pv_comparison_immutable');
    expect(sql).toContain('tr_pv_blocker_immutable');
    expect(sql).toContain('tr_pv_blocker_resolution_immutable');
    expect(sql).toContain('tr_pv_decision_immutable');
    expect(sql).toContain('tr_pv_audit_immutable');
  });

  it('keeps both rollout gates disabled by default', () => {
    expect(sql).toContain("'dofa_module4_product_verification',false");
    expect(sql).toContain("'dofa_module4_inventory_gate',false");
  });
});
