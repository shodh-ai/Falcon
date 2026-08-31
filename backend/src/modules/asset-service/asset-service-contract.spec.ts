import { readFileSync } from 'fs';
import { join } from 'path';

describe('DoFA Module 8 contracts', () => {
  const service = readFileSync(
    join(process.cwd(), 'src/modules/asset-service/asset-service.service.ts'),
    'utf8',
  );
  it.each([
    'AssetServiceCaseSubmitted.v1',
    'AssetServiceHoldPlaced.v1',
    'WarrantyEligibilityDecided.v1',
    'AssetServiceWorkStarted.v1',
    'AssetServiceEstimateRevised.v1',
    'AssetServicePartsRequested.v1',
    'AssetReverificationRequested.v1',
    'AssetServiceCompleted.v1',
    'AssetReturnedToService.v1',
    'AssetServiceIrreparable.v1',
    'AssetRetirementReferralRequested.v1',
    'AssetServiceCaseSuperseded.v1',
  ])('publishes %s', (event) => expect(service).toContain(event));
  it('requires Module 2 authorization for chargeable work', () => {
    expect(service).toContain(
      'External paid work cannot start before Module 2 issues an order',
    );
    expect(service).toContain("row.coverage_status === 'CHARGEABLE'");
  });
  it('enforces parts authority boundaries', () => {
    expect(service).toContain('Stocked parts require a Module 6 request');
    expect(service).toContain('Tracked components require a Module 5 identity');
    expect(service).toContain(
      'Purchased parts require a Module 2 procurement case',
    );
  });
  it('requires independent service acceptance', () =>
    expect(service).toContain(
      'Technician cannot accept their own completed work',
    ));
  it('does not mutate closed cases when reopening', () =>
    expect(service).toContain(
      'Only a closed case can be reopened by supersession',
    ));
});
