import { readFileSync } from 'fs';
import { join } from 'path';

const verification = readFileSync(
  join(
    process.cwd(),
    'src/modules/product-verification/product-verification.service.ts',
  ),
  'utf8',
);
const procurement = readFileSync(
  join(process.cwd(), 'src/modules/procurements/procurement.service.ts'),
  'utf8',
);

describe('Module 4 authority and event contracts', () => {
  it.each([
    'PhysicalVerificationStarted.v1',
    'PhysicalProductVerified.v1',
    'PhysicalProductRejected.v1',
    'PhysicalVerificationReconsidered.v1',
    'PhysicalVerificationIdentityRevoked.v1',
    'PhysicalVerificationLineCompleted.v1',
  ])('publishes %s transactionally', (event) => {
    expect(verification).toContain(event);
  });

  it('publishes a subject-level verified contract', () => {
    for (const field of [
      'subject_type',
      'verified_quantity',
      'invoice_allocations',
      'verification_identity_id',
      'verification_record_hash',
      'evidence_manifest_hash',
      'reference_snapshot_hash',
      'signing_key_version',
    ])
      expect(verification).toContain(field);
  });

  it('does not allocate permanent inventory identities', () => {
    expect(verification).not.toContain('INSERT INTO university_assets');
    expect(verification).not.toContain('INSERT INTO inventory_items');
    expect(verification).not.toContain('UPDATE university_assets');
  });

  it('makes Module 2 consume only line completion projections', () => {
    expect(procurement).toContain('applyPhysicalVerificationCompletion');
    expect(procurement).toContain('source_module,status_type,status');
    expect(procurement).toContain("'MODULE_4','PHYSICAL_VERIFICATION'");
  });
});
