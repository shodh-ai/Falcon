import { readFileSync } from 'fs';
import { join } from 'path';
const service = readFileSync(
  join(process.cwd(), 'src/modules/inventory/inventory.service.ts'),
  'utf8',
);
describe('Module 5 authority contracts', () => {
  it.each([
    'InventoryIngestionStarted.v1',
    'InventoryIdentityPrepared.v1',
    'InventoryIdentityAllocated.v1',
    'RFIDTagBound.v1',
    'InventoryRecordActivated.v1',
    'InventoryRecordQuarantined.v1',
    'InventoryLotMovementPosted.v1',
    'InventoryDiscrepancyRaised.v1',
    'InventoryDiscrepancyResolved.v1',
    'InventoryLineCompleted.v1',
  ])('publishes %s', (event) => expect(service).toContain(event));
  it('keeps manufacturer and university identities distinct', () => {
    expect(service).toContain('manufacturer_serial');
    expect(service).toContain('university_asset_id');
    expect(service).toContain('logical_rfid_id');
    expect(service).toContain('physical_tag_uid');
  });
  it('makes lot transfers two-sided and atomic', () => {
    expect(service).toContain("'TRANSFER_OUT'");
    expect(service).toContain("'TRANSFER_IN'");
    expect(service).toContain('movement_group_id');
  });
  it('quarantines stale Module 4 identities', () => {
    expect(service).toContain("record_status='QUARANTINED'");
    expect(service).toContain("status='REVOKED'");
  });
  it('locks idempotency and policy version allocation without locking aggregates', () => {
    expect(service).toContain('pg_advisory_xact_lock');
    expect(service).not.toContain(
      'MAX(policy_version),0) version FROM inv_identifier_policies WHERE tenant_id=$1 FOR UPDATE',
    );
  });
  it('enforces category attributes and scoped target references', () => {
    expect(service).toContain('INVENTORY_REQUIRED_ATTRIBUTES_MISSING');
    expect(service).toContain('Custodian is outside the tenant scope');
    expect(service).toContain('Location is outside the tenant scope');
  });
  it('ingests the canonical Module 1 model_number field', () => {
    expect(service).toContain('al.model_number');
    expect(service).toContain('source.model_number');
    expect(service).not.toContain('al.model,');
    expect(service).not.toContain('source.model ??');
  });
  it('casts receipt cohort quantities before calculating resulting stock', () => {
    expect(service).toContain('$11::numeric+$9::numeric');
    expect(service).not.toContain('$11+$9');
  });
  it('keeps Module 5 source snapshots separate from Module 3 invoice snapshots', () => {
    expect(service).toContain('inv_inventory_source_snapshots');
    expect(service).not.toContain('FROM inv_source_snapshots WHERE inventory_record_id');
    expect(service).not.toContain('INSERT INTO inv_source_snapshots(tenant_id,inventory_record_id');
  });
  it('normalizes mutation query results and refuses invalid identity sequences', () => {
    expect(service).toContain('Array.isArray(rows[0]) ? rows[0][0] : rows[0]');
    expect(service).toContain('INVENTORY_IDENTIFIER_SEQUENCE_INVALID');
    expect(service).not.toContain('Number(rows[0].allocated)');
  });
  it('casts state-change JSON parameters before extracting projected values', () => {
    expect(service).toContain(
      "(($3::jsonb)->>'owner_department_id')::int",
    );
    expect(service).toContain(
      "NULLIF(($3::jsonb)->>'custodian_user_id','')::uuid",
    );
    expect(service).not.toContain("($3->>'owner_department_id')::int");
  });
  it('blocks both state-change initiation and acknowledgement during a return hold', () => {
    const guardedStateChanges = service.match(
      /Inventory state changes are blocked by an active return hold/g,
    );
    expect(guardedStateChanges).toHaveLength(3);
    expect(service).toMatch(
      /async requestStateChange[\s\S]*?lifecycle_status === 'RETURN_PENDING'[\s\S]*?withIdempotency/,
    );
    expect(service).toMatch(
      /async acknowledgeStateChange[\s\S]*?lifecycle_status === 'RETURN_PENDING'[\s\S]*?withIdempotency/,
    );
  });
  it('blocks return and normal state changes during an active Module 8 service hold', () => {
    expect(service).toMatch(
      /async placeReturnHold[\s\S]*?FROM svc_asset_holds[\s\S]*?Return execution is blocked by an active Module 8 service hold/,
    );
    expect(service).toMatch(
      /async requestStateChange[\s\S]*?FROM svc_asset_holds[\s\S]*?Inventory state changes are blocked by an active Module 8 service hold/,
    );
    expect(service).toMatch(
      /async acknowledgeStateChange[\s\S]*?FROM svc_asset_holds[\s\S]*?Inventory state changes are blocked by an active Module 8 service hold/,
    );
    expect(service).toMatch(
      /async placeServiceHold[\s\S]*?'RETURN_PENDING',[\s\S]*?'RETURNED',[\s\S]*?'RETIRED',[\s\S]*?'WRITTEN_OFF',[\s\S]*?'DISPOSED'/,
    );
  });
});
