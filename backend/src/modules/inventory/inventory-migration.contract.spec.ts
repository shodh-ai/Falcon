import { readFileSync } from 'fs';
import { join } from 'path';
const sql = readFileSync(
  join(
    process.cwd(),
    'migrations/20260901120000_dofa_module5_universal_inventory.sql',
  ),
  'utf8',
);
describe('Module 5 migration contract', () => {
  it.each([
    'inv_identifier_policies',
    'inv_category_policies',
    'inv_product_models',
    'inv_procurement_batches',
    'inv_records',
    'inv_source_snapshots',
    'inv_asset_identities',
    'inv_logical_rfids',
    'inv_rfid_bindings',
    'inv_identity_revisions',
    'inv_lot_movements',
    'inv_state_history',
    'inv_discrepancies',
    'inv_financial_projections',
    'inv_legacy_reconciliations',
    'inv_outbox_events',
  ])('creates %s', (table) =>
    expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`),
  );
  it('protects append-only identity and quantity facts', () => {
    expect(sql).toContain('tr_inv_identity_revision_immutable');
    expect(sql).toContain('inv_protect_identity_revision');
    expect(sql).toContain('tr_inv_identity_revision_no_delete');
    expect(sql).toContain('tr_inv_lot_movement_immutable');
    expect(sql).toContain('tr_inv_audit_immutable');
  });
  it('keeps rollout gates off', () => {
    expect(sql).toContain("'dofa_module5_inventory',false");
    expect(sql).toContain("'dofa_module5_identity_gate',false");
  });
  it('marks compatibility tables as projections', () => {
    expect(sql).toContain('module5_source_id');
    expect(sql).toContain('module5_managed');
  });
  it('persists category-required attributes and allows system receipt movements', () => {
    expect(sql).toContain("attributes JSONB NOT NULL DEFAULT '{}'");
    expect(sql).toContain('actor_id UUID REFERENCES users');
  });
});
