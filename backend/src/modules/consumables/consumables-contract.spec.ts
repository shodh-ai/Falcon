import { readFileSync } from 'fs';
import { join } from 'path';

describe('DoFA Module 6 contract', () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      'migrations/20260902120000_dofa_module6_consumables_operations.sql',
    ),
    'utf8',
  );
  const service = readFileSync(
    join(process.cwd(), 'src/modules/consumables/consumables.service.ts'),
    'utf8',
  );
  it('keeps Module 5 as the authoritative store ledger', () => {
    expect(service).toContain('postConsumableMovement');
    expect(service).not.toMatch(/UPDATE\s+inv_records\s+SET\s+.*balance/i);
    expect(migration).toContain(
      'source_movement_id UUID REFERENCES inv_lot_movements',
    );
  });
  it('models issue, consumption, and internal return without double counting', () => {
    expect(migration).toContain(
      "event_type IN('ISSUED','CONSUMED','ISSUE_RETURNED')",
    );
    expect(service).toContain("movement_type: 'ISSUE_RETURN'");
    expect(service).toContain(
      "input.action === 'CONSUME' ? input.quantity : 0",
    );
  });
  it('locks exact LOTs and allocates in deterministic FEFO order', () => {
    expect(service).toContain('FOR UPDATE OF r');
    expect(service).toContain(
      'ORDER BY s.expiry_date NULLS LAST,r.created_at,r.inventory_record_id',
    );
    expect(migration).toContain('UNIQUE(reservation_id,inventory_record_id)');
  });
  it('protects immutable custody and audit history', () => {
    expect(migration).toContain('tr_con_custody_immutable');
    expect(migration).toContain('tr_con_audit_immutable');
    expect(migration).toContain(
      'CHECK(consumed_quantity+returned_quantity<=issued_quantity)',
    );
  });
  it('scopes replenishment stock, inbound, and suggestions to the owning department', () => {
    expect(service).toContain(
      'r.product_model_id,r.owner_department_id,r.location_space_id',
    );
    expect(service).toContain(
      'c.department_id IS NOT DISTINCT FROM $3',
    );
    expect(service).toContain(
      'tenant_id,product_model_id,department_id,location_space_id',
    );
  });
  it('rejects malformed workflow identifiers before PostgreSQL sees them', () => {
    expect(service).toContain('const UUID_RE =');
    expect(service).toContain(
      "this.uuid(input.issue_allocation_id, 'Issue allocation ID')",
    );
    expect(service).toContain(
      "this.uuid(input.reservation_id, 'Reservation ID')",
    );
    expect(service).toContain("this.uuid(id, 'Stock request ID')");
  });
});
