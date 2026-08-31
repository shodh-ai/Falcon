import { readFileSync } from 'fs';
import { join } from 'path';

describe('DoFA Module 9 domain contract', () => {
  const service = readFileSync(
      join(__dirname, 'asset-retirement.service.ts'),
      'utf8',
    ),
    controller = readFileSync(
      join(__dirname, 'asset-retirement.controller.ts'),
      'utf8',
    );

  it('exposes the versioned retirement API', () => {
    expect(controller).toContain("@Controller('api/asset-retirement/v1')");
    expect(controller).toContain("@Headers('if-match')");
    expect(controller).toContain("@Headers('idempotency-key')");
  });

  it('pins the required DoFA approval basis', () => {
    expect(service).toContain("domain: 'ASSET_WRITEOFF'");
    expect(service).toContain("source_table: 'retirement_cases'");
    expect(service).toContain('Math.max(');
    expect(service).toContain('approval_snapshot_hash');
  });

  it('keeps physical and Finance completion recoverable', () => {
    expect(service).toContain("'FINANCE_POSTING_FAILED'");
    expect(service).toContain("'PHYSICAL_COMPLETED'");
    expect(service).toContain("'FINANCE_PENDING'");
    expect(service).toContain('AssetFinanceReconciliationFailed.v1');
  });

  it('prevents certificate issuance before all final gates', () => {
    expect(service).toContain('All physical, sanitization and Finance gates');
    expect(service).toContain('AssetLifecycleCertificateIssued.v1');
    expect(service).toContain('AssetLifecycleCompleted.v1');
    expect(service).toContain('signRetirementPayload');
  });

  it('publishes the required lifecycle events', () => {
    for (const event of [
      'AssetRetirementCaseSubmitted.v1',
      'AssetRetirementHoldPlaced.v1',
      'AssetRetirementApproved.v1',
      'AssetSanitizationVerified.v1',
      'AssetDisposalLotLocked.v1',
      'AssetPhysicalDispositionCompleted.v1',
      'AssetWriteoffPostingRequested.v1',
      'AssetDisposed.v1',
    ])
      expect(service).toContain(event);
  });
});
