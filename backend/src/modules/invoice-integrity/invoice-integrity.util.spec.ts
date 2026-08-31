import {
  amountWithinTolerance,
  automatedClearanceEligible,
  calculateRisk,
  evidenceSetHash,
} from './invoice-integrity.util';

describe('Module 3 deterministic integrity primitives', () => {
  it('separates risk, evidence coverage, and confidence', () => {
    const result = calculateRisk([
      {
        name: 'SOURCE',
        weight: 50,
        status: 'AVAILABLE',
        normalized_score: 10,
        confidence: 90,
      },
      { name: 'HISTORY', weight: 25, status: 'UNAVAILABLE' },
      {
        name: 'PRICE',
        weight: 25,
        status: 'AVAILABLE',
        normalized_score: 30,
        confidence: 70,
      },
    ]);
    expect(result.risk_score).toBe(16.67);
    expect(result.coverage_score).toBe(75);
    expect(result.confidence_score).toBe(83.33);
  });

  it('does not treat missing evidence as zero risk', () => {
    const result = calculateRisk([
      { name: 'SOURCE', weight: 100, status: 'UNAVAILABLE' },
    ]);
    expect(result.risk_score).toBe(100);
    expect(result.coverage_score).toBe(0);
  });

  it('requires every automated-clearance gate', () => {
    const base = {
      invoiceType: 'ONLINE_INSTITUTIONAL' as const,
      analysisResult: 'SOURCE_MATCHED',
      riskScore: 10,
      coverageScore: 95,
      confidenceScore: 90,
      minCoverage: 90,
      minConfidence: 80,
      blockers: [] as string[],
      requiredEvidenceComplete: true,
    };
    expect(automatedClearanceEligible(base)).toBe(true);
    expect(
      automatedClearanceEligible({ ...base, blockers: ['CURRENCY_MISMATCH'] }),
    ).toBe(false);
    expect(
      automatedClearanceEligible({ ...base, invoiceType: 'OFFLINE_PRINTED' }),
    ).toBe(false);
  });

  it('hashes evidence independently of input ordering', () => {
    const first = evidenceSetHash({
      evidence: [
        { evidence_id: 'b', content_hash: '2' },
        { evidence_id: 'a', content_hash: '1' },
      ],
      snapshots: [],
      analysisIds: ['y', 'x'],
      riskAssessmentId: 'risk',
    });
    const second = evidenceSetHash({
      evidence: [
        { evidence_id: 'a', content_hash: '1' },
        { evidence_id: 'b', content_hash: '2' },
      ],
      snapshots: [],
      analysisIds: ['x', 'y'],
      riskAssessmentId: 'risk',
    });
    expect(first).toBe(second);
  });

  it('uses the lower absolute or percentage rounding tolerance', () => {
    expect(amountWithinTolerance(1000, 1000.5)).toBe(true);
    expect(amountWithinTolerance(1000, 1001.01)).toBe(false);
  });
});
