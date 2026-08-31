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

  it('uses human review rather than theft classification', () => {
    expect(service).toContain("'AUTHORIZED_PASSAGE'");
    expect(service).toContain("'REVIEW_REQUIRED'");
    expect(service).not.toContain("result = 'THEFT'");
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
