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

  it('locks quantity rows before summing them in application code', () => {
    expect(verification).not.toMatch(
      /SUM\(subject_quantity\)[\s\S]{0,160}FOR UPDATE/,
    );
    expect(verification).not.toMatch(
      /SUM\(allocated_quantity\)[\s\S]{0,160}FOR UPDATE/,
    );
    expect(verification).toContain('row.aggregate_revision = revision');
  });

  it('reuses only the exact returned subject allocation for a vendor replacement', () => {
    expect(verification).toContain('JOIN ret_cases rc');
    expect(verification).toContain('JOIN ret_case_allocations rca');
    expect(verification).toContain("rc.disposition='REPLACEMENT_UNIT'");
    expect(verification).toContain("rca.status IN ('SHIPPED','RESOLVED')");
    expect(verification).toContain('JOIN proc_return_subject_allocations rsa');
    expect(verification).toContain('pia.subject_id=rs.subject_id');
    expect(verification).toContain('pr.receipt_id=$1');
    expect(verification).toContain(
      "r.status IN ('VENDOR_RECEIVED','RESOLVED')",
    );
    expect(verification).toContain('releasedReplacementQuantity');
    expect(verification).toContain(
      'Number(invoice.quantity) + releasedReplacementQuantity + 0.0005',
    );
  });

  it('supports deterministic re-analysis for a new physical verification revision', () => {
    expect(verification).toContain(
      'ON CONFLICT(subject_id,snapshot_hash) DO NOTHING',
    );
    expect(verification).toContain(
      'verification_revision: Number(subject.verification_revision)',
    );
    expect(verification).toContain(
      'capture_session_id: session.capture_session_id',
    );
    expect(verification).toContain('evidence_manifest_hash: verificationHash(');
    expect(verification).toContain('Array.isArray(supersededResult[0])');
  });

  it('allows only one final decision for each subject verification revision', () => {
    expect(verification).toContain('SUBJECT_REVISION_ALREADY_DECIDED');
    expect(verification).toContain(
      'WHERE subject_id=$1 AND verification_revision=$2',
    );
  });
});
