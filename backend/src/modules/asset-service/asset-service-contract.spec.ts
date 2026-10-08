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
  it('appends terminal events before activating closed-case immutability', () => {
    const acceptStart = service.indexOf('async accept(');
    const returnedEvent = service.indexOf(
      "'AssetReturnedToService.v1'",
      acceptStart,
    );
    const terminalUpdate = service.indexOf(
      'UPDATE svc_cases SET workflow_status=$2,final_outcome=$3',
      acceptStart,
    );
    expect(acceptStart).toBeGreaterThanOrEqual(0);
    expect(returnedEvent).toBeGreaterThan(acceptStart);
    expect(terminalUpdate).toBeGreaterThan(returnedEvent);
    expect(service.slice(terminalUpdate, terminalUpdate + 300)).toContain(
      'closed_at=CASE WHEN $5 THEN NOW() ELSE NULL END',
    );
  });
  it('does not mutate closed cases when reopening', () =>
    expect(service).toContain(
      'Only a closed case can be reopened by supersession',
    ));
  it('normalizes PostgreSQL UPDATE RETURNING rows for task and reverification gates', () => {
    expect(service).toContain('Array.isArray(mutationResult[0])');
    expect(service).toContain('const updated = Array.isArray(result[0])');
    expect(service).toContain('No pending re-verification request');
  });
  it('binds a cleared reverification to its decision and verified source event', () => {
    expect(service).toContain(
      'JOIN pv_decisions d ON d.verification_id=i.verification_id',
    );
    expect(service).toContain("e.event_type='PhysicalProductVerified.v1'");
    expect(service).toContain(
      "e.payload->>'verification_identity_id'=i.verification_identity_id::text",
    );
    expect(service).not.toContain(
      'SELECT i.verification_identity_id,i.verification_case_id FROM pv_verification_identities i',
    );
  });
});
