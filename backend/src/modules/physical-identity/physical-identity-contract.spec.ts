import { readFileSync } from 'fs';
import { join } from 'path';

describe('DoFA Module X domain contract', () => {
  const service = readFileSync(
    join(__dirname, 'physical-identity.service.ts'),
    'utf8',
  );
  const controller = readFileSync(
    join(__dirname, 'physical-identity.controller.ts'),
    'utf8',
  );
  const inventory = readFileSync(
    join(__dirname, '../inventory/inventory.service.ts'),
    'utf8',
  );

  it('exposes separate human and machine contracts', () => {
    expect(controller).toContain("@Controller('api/physical-identity/v1')");
    expect(controller).toContain("@Post('jobs/:id/claim')");
    expect(controller).toContain("@Post('gate-observations/batch')");
    expect(service).toContain("'x-client-cert-fingerprint'");
    expect(service).toContain("'x-device-signature'");
  });

  it('allows identities only through signed Module 5 jobs', () => {
    expect(service).toContain(
      'ensurePhysicalProvisioningIdentityInTransaction',
    );
    expect(service).toContain('qr_verification_uri');
    expect(service).toContain('signPhysicalIdentity');
    expect(inventory).toContain('MODULE_X_PAYLOAD_MISMATCH');
    expect(inventory).toContain('verifyModuleXAttachmentInTransaction');
  });
  it('allows only a controlled replacement job to reprovision a returned repaired original', () => {
    expect(service).toContain(
      "OR ($6='REPLACEMENT' AND r.lifecycle_status='RETURNED')",
    );
    expect(service).toContain("jobType === 'REPLACEMENT'");
  });

  it('excludes controlled and terminal asset lifecycles from provisioning', () => {
    for (const lifecycle of [
      'MAINTENANCE',
      'RETURN_PENDING',
      'RETURNED',
      'RETIRED',
      'WRITTEN_OFF',
      'DISPOSED',
    ]) {
      expect(service).toContain(`'${lifecycle}'`);
      expect(inventory).toContain(`'${lifecycle}'`);
    }
    expect(inventory).toContain(
      'Asset lifecycle is not eligible for physical provisioning',
    );
  });

  it('uses human review rather than theft classification', () => {
    expect(service).toContain("'AUTHORIZED_PASSAGE'");
    expect(service).toContain("'REVIEW_REQUIRED'");
    expect(service).not.toContain("result = 'THEFT'");
  });

  it('sequences every observation event without outbox collisions', () => {
    expect(service).toContain(
      'SELECT COALESCE(MAX(aggregate_sequence),0)::bigint latest FROM pix_outbox_events WHERE aggregate_id=$1',
    );
    expect(service).toContain('aggregate_revision: sequence');
    expect(service).toContain('aggregate_sequence: sequence');
  });

  it('uses typed booleans for gate-alert transition timestamps', () => {
    expect(service).toContain(
      'acknowledged_by=CASE WHEN $5 THEN $3 ELSE acknowledged_by END',
    );
    expect(service).toContain(
      'resolved_at=CASE WHEN $6 THEN NOW() ELSE resolved_at END',
    );
    expect(service).not.toContain("CASE WHEN $2='ACKNOWLEDGED'");
  });

  it('publishes required physical identity and gate events', () => {
    for (const event of [
      'PhysicalIdentityProvisioningRequested.v1',
      'RFIDEncodingCompleted.v1',
      'AssetLabelPrinted.v1',
      'PhysicalIdentifierVerified.v1',
      'GateAssetObserved.v1',
      'GateMovementAuthorized.v1',
      'GateMovementReviewRequired.v1',
    ])
      expect(service).toContain(event);
  });
});
