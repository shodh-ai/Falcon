export type IntegrityCaseSummary = {
  integrity_case_id: string;
  invoice_id: string;
  invoice_revision: number;
  invoice_number: string;
  invoice_type: string;
  workflow_state: string;
  analysis_result?: string | null;
  final_decision?: string | null;
  trust_level: string;
  vendor_name: string;
  order_number: string;
  total_amount: number | string;
  currency: string;
  aggregate_revision: number;
  updated_at: string;
};

export type IntegrityDashboard = {
  total_cases: number;
  by_state: Record<string, number>;
  source_unavailable: number;
  high_risk: number;
  pending_certification: number;
};

export type IntegrityCaseDetail = IntegrityCaseSummary & {
  document_hash: string;
  invoice_submitter_id: string;
  invoice: Record<string, unknown>;
  evidence: Array<Record<string, unknown>>;
  source_snapshots: Array<Record<string, unknown>>;
  document_analyses: Array<Record<string, unknown>>;
  comparisons: Array<Record<string, unknown>>;
  market_observations: Array<Record<string, unknown>>;
  risk_assessments: Array<Record<string, unknown>>;
  blockers: Array<Record<string, unknown>>;
  evidence_requests: Array<Record<string, unknown>>;
  investigations: Array<Record<string, unknown>>;
  certifications: Array<Record<string, unknown>>;
  audit_timeline: Array<Record<string, unknown>>;
};

type Api = {
  get<T>(path: string, headers?: Record<string, string>): Promise<T>;
  post<T>(
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T>;
};

export function createInvoiceIntegrityApi(api: Api) {
  const root = "/api/invoice-integrity/v1";
  const headers = (revision: number, key?: string) => ({
    "If-Match": String(revision),
    ...(key ? { "Idempotency-Key": key } : {}),
  });
  return {
    dashboard: () => api.get<IntegrityDashboard>(`${root}/dashboard`),
    list: (state?: string) =>
      api.get<IntegrityCaseSummary[]>(
        `${root}/cases${state ? `?state=${encodeURIComponent(state)}` : ""}`,
      ),
    get: (caseId: string) =>
      api.get<IntegrityCaseDetail>(`${root}/cases/${caseId}`),
    requestStepUp: (
      caseId: string,
      purpose: "ATTENDED_RETRIEVAL" | "CERTIFICATION",
    ) =>
      api.post<{ challenge_id: string; expires_at: string; dev_otp?: string }>(
        `${root}/cases/${caseId}/step-up/request`,
        { purpose },
      ),
    verifyStepUp: (caseId: string, challengeId: string, otp: string) =>
      api.post(`${root}/cases/${caseId}/step-up/${challengeId}/verify`, {
        otp,
      }),
    analyze: (caseId: string, revision: number) =>
      api.post(
        `${root}/cases/${caseId}/analyze`,
        {},
        headers(revision, crypto.randomUUID()),
      ),
    openInvestigation: (caseId: string, revision: number, notes: string) =>
      api.post(
        `${root}/cases/${caseId}/investigations`,
        { restricted_notes: notes },
        headers(revision),
      ),
    recommend: (
      caseId: string,
      investigationId: string,
      revision: number,
      recommendation: "CLEAR" | "REJECT" | "REQUEST_MORE_EVIDENCE",
      reason: string,
    ) =>
      api.post(
        `${root}/cases/${caseId}/investigations/${investigationId}/recommend`,
        { recommendation, reason },
        headers(revision),
      ),
    certify: (
      caseId: string,
      revision: number,
      investigationId: string,
      decision: "CLEARED_HUMAN" | "REJECTED_UNRESOLVED",
      decisionReason: string,
    ) =>
      api.post(
        `${root}/cases/${caseId}/certifications`,
        {
          investigation_id: investigationId,
          decision,
          decision_reason: decisionReason,
        },
        headers(revision, crypto.randomUUID()),
      ),
    uploadEvidence: (caseId: string, type: string, form: FormData) =>
      api.post(
        `${root}/cases/${caseId}/evidence?type=${encodeURIComponent(type)}`,
        form,
      ),
  };
}
