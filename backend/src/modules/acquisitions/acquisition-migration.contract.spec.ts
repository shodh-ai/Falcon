import { readFileSync } from 'fs';
import { join } from 'path';

describe('DoFA Module 1 migration contract', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'migrations',
      '20260828120000_dofa_module1_acquisitions.sql',
    ),
    'utf8',
  );

  it.each([
    'acq_requests',
    'acq_request_versions',
    'acq_lines',
    'acq_vendor_scoring_policies',
    'acq_vendor_recommendations',
    'acq_budget_reservations',
    'acq_budget_reservation_events',
    'acq_dofa_route_snapshots',
    'acq_approval_decisions',
    'acq_import_previews',
    'acq_integration_clients',
    'acq_integration_replay_nonces',
    'acq_audit_events',
    'acq_outbox_events',
  ])('creates required relation %s', (relation) => {
    expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${relation}`);
  });

  it('enforces submitted-version, line, audit, decision and reservation immutability', () => {
    expect(sql).toContain('acq_block_submitted_version_business_changes');
    expect(sql).toContain('tr_acq_lines_immutable_update');
    expect(sql).toContain('tr_acq_lines_immutable_delete');
    expect(sql).toContain('tr_acq_audit_no_update');
    expect(sql).toContain('tr_acq_decision_no_delete');
    expect(sql).toContain('tr_acq_reservation_no_update');
  });

  it('pins version identities, hashes, statuses and line-level gates', () => {
    for (const token of [
      'acquisition_number',
      'acquisition_version_id',
      'version_number',
      'snapshot_hash',
      'schema_version',
      'required_by_date',
      'special_procurement_requirements',
      'validation_status',
      'vendor_review_status',
      'line_status',
    ])
      expect(sql).toContain(token);
  });

  it('contains hard tenant/object controls and no purchase-order creation', () => {
    expect(sql).toContain("CHECK (object_key LIKE tenant_id::text || '/%')");
    expect(sql).toContain(
      'CHECK ((principal_user_id IS NOT NULL) <> (principal_role IS NOT NULL))',
    );
    expect(sql).not.toMatch(/INSERT\s+INTO\s+fin_purchase_orders/i);
  });

  it('seeds ACQUISITION as a universal, published DoFA domain', () => {
    expect(sql).toMatch(/INSERT INTO dofa_matrices[\s\S]+?'ACQUISITION'/);
    expect(sql).toMatch(/INSERT INTO dofa_policy_graphs[\s\S]+?'ACQUISITION'/);
  });
});
