import { readFileSync } from 'fs';
import { join } from 'path';
describe('DoFA Module 7 contract', () => {
  const migration = readFileSync(
      join(
        process.cwd(),
        'migrations/20260903120000_dofa_module7_returns_doa.sql',
      ),
      'utf8',
    ),
    service = readFileSync(
      join(process.cwd(), 'src/modules/returns/returns.service.ts'),
      'utf8',
    ),
    inventory = readFileSync(
      join(process.cwd(), 'src/modules/inventory/inventory.service.ts'),
      'utf8',
    ),
    verification = readFileSync(
      join(
        process.cwd(),
        'src/modules/product-verification/product-verification.service.ts',
      ),
      'utf8',
    );
  it('holds exact ITEM/LOT subjects without reducing inventory', () => {
    expect(migration).toContain('uq_ret_active_item_allocation');
    expect(migration).toContain('ret_check_allocation_conservation');
    expect(service).toContain('placeReturnHold');
    expect(service).not.toMatch(/submit[\s\S]{0,4000}postConsumableMovement/);
  });
  it('changes authoritative inventory only when shipment occurs', () => {
    expect(service).toContain('shipReturnAllocation');
    expect(inventory).toContain("movement_type: 'RETURN'");
    expect(inventory).toContain("lifecycle_status='RETURNED'");
  });
  it('uses exact Module 2 allocations for Module 4 invalidation', () => {
    expect(migration).toContain('proc_return_subject_allocations');
    expect(verification).toContain('RETURN_SUBJECT_ALLOCATION_REQUIRED');
    expect(verification).toContain('JOIN proc_return_subject_allocations');
  });
  it('separates repaired originals and replacement units', () => {
    expect(migration).toContain(
      "lineage_type IN('REPAIR_RETURN','REPLACEMENT_UNIT')",
    );
    expect(service).toMatch(/\['REPAIR_RETURN',\s*'REPLACEMENT_UNIT'\]/);
    expect(service).toContain('resulting_subject_id');
  });
  it('prevents superseded decisions from executing', () => {
    expect(service).toContain('ReturnCaseSuperseded.v1');
    expect(service).toContain('workflow_status=$2,active_decision_id=$3');
    expect(service).toContain('requires_compensation');
  });
});
