import { createHash } from 'crypto';
import type { InvoiceType, RiskFactor } from './invoice-integrity.types';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function integrityHash(value: unknown) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

export function calculateRisk(factors: RiskFactor[]) {
  const applicable = factors.filter(
    (factor) => factor.status !== 'NOT_APPLICABLE',
  );
  const available = applicable.filter(
    (factor) => factor.status === 'AVAILABLE',
  );
  const applicableWeight = applicable.reduce(
    (sum, factor) => sum + factor.weight,
    0,
  );
  const availableWeight = available.reduce(
    (sum, factor) => sum + factor.weight,
    0,
  );
  const weightedRisk = available.reduce(
    (sum, factor) =>
      sum +
      factor.weight * Math.max(0, Math.min(100, factor.normalized_score ?? 0)),
    0,
  );
  const weightedConfidence = available.reduce(
    (sum, factor) =>
      sum + factor.weight * Math.max(0, Math.min(100, factor.confidence ?? 0)),
    0,
  );
  const riskScore = availableWeight ? weightedRisk / availableWeight : 100;
  const coverageScore = applicableWeight
    ? (availableWeight * 100) / applicableWeight
    : 0;
  const confidenceScore = availableWeight
    ? weightedConfidence / availableWeight
    : 0;
  return {
    factors: factors.map((factor) => ({
      ...factor,
      weighted_score:
        factor.status === 'AVAILABLE'
          ? ((factor.normalized_score ?? 0) * factor.weight) / 100
          : null,
    })),
    risk_score: Number(riskScore.toFixed(2)),
    coverage_score: Number(coverageScore.toFixed(2)),
    confidence_score: Number(confidenceScore.toFixed(2)),
    risk_band:
      riskScore <= 29
        ? ('LOW' as const)
        : riskScore <= 59
          ? ('MEDIUM' as const)
          : ('HIGH' as const),
  };
}

export function automatedClearanceEligible(input: {
  invoiceType: InvoiceType;
  analysisResult: string;
  riskScore: number;
  coverageScore: number;
  confidenceScore: number;
  minCoverage: number;
  minConfidence: number;
  blockers: string[];
  requiredEvidenceComplete: boolean;
}) {
  return (
    input.invoiceType === 'ONLINE_INSTITUTIONAL' &&
    input.analysisResult === 'SOURCE_MATCHED' &&
    input.riskScore < 30 &&
    input.coverageScore >= input.minCoverage &&
    input.confidenceScore >= input.minConfidence &&
    input.blockers.length === 0 &&
    input.requiredEvidenceComplete
  );
}

export function evidenceSetHash(input: {
  evidence: Array<{ evidence_id: string; content_hash: string }>;
  snapshots: Array<{ source_snapshot_id: string; content_hash: string }>;
  analysisIds: string[];
  riskAssessmentId: string;
}) {
  return integrityHash({
    evidence: [...input.evidence].sort((a, b) =>
      a.evidence_id.localeCompare(b.evidence_id),
    ),
    snapshots: [...input.snapshots].sort((a, b) =>
      a.source_snapshot_id.localeCompare(b.source_snapshot_id),
    ),
    analysis_ids: [...input.analysisIds].sort(),
    risk_assessment_id: input.riskAssessmentId,
  });
}

export function amountWithinTolerance(
  expected: number,
  actual: number,
  absoluteTolerance = 1,
  percentTolerance = 0.1,
) {
  const allowed = Math.min(
    absoluteTolerance,
    Math.abs(expected) * (percentTolerance / 100),
  );
  return Math.abs(expected - actual) <= allowed + 0.000_001;
}
