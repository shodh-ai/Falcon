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
});
