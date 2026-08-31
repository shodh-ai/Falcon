export type ProductVerificationCaseSummary = {
  verification_case_id: string;
  workflow_state: string;
  subject_type: "ITEM" | "LOT";
  eligible_quantity: number | string;
  unit_of_measure: string;
  product_name: string;
  category: string;
  receipt_number: string;
  order_number: string;
  subject_count: number;
  verified_count: number;
  aggregate_revision: number;
  updated_at: string;
};

export type ProductVerificationDashboard = {
  total_cases: number;
  awaiting_capture: number;
  manual_review: number;
  closed: number;
  subjects: number;
  verified_subjects: number;
};

export type ProductVerificationCaseDetail = ProductVerificationCaseSummary & {
  context: Record<string, unknown>;
  subjects: Array<Record<string, unknown>>;
  eligible_invoice_lines: Array<Record<string, unknown>>;
  capture_sessions: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
  analyses: Array<Record<string, unknown>>;
  comparisons: Array<Record<string, unknown>>;
  blockers: Array<Record<string, unknown>>;
  review_recommendations: Array<Record<string, unknown>>;
  decisions: Array<Record<string, unknown>>;
  identities: Array<Record<string, unknown>>;
  inventory_projections: Array<Record<string, unknown>>;
  audit_timeline: Array<Record<string, unknown>>;
};

type Api = {
  get<T>(path: string, headers?: Record<string, string>): Promise<T>;
  post<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T>;
};

export function createProductVerificationApi(api: Api) {
  const root = "/api/product-verification/v1";
  const mutationHeaders = (revision: number, idempotent = false) => ({
    "If-Match": String(revision),
    ...(idempotent ? { "Idempotency-Key": crypto.randomUUID() } : {}),
  });
  return {
    dashboard: () => api.get<ProductVerificationDashboard>(`${root}/dashboard`),
    list: (state?: string) =>
      api.get<ProductVerificationCaseSummary[]>(
        `${root}/cases${state ? `?state=${encodeURIComponent(state)}` : ""}`,
      ),
    get: (caseId: string) => api.get<ProductVerificationCaseDetail>(`${root}/cases/${caseId}`),
    createLot: (caseId: string, revision: number, body: Record<string, unknown>) =>
      api.post(`${root}/cases/${caseId}/lots`, body, mutationHeaders(revision)),
    allocateInvoice: (caseId: string, subjectId: string, revision: number, invoiceLineId: string, quantity: number) =>
      api.post(
        `${root}/cases/${caseId}/subjects/${subjectId}/invoice-allocations`,
        { invoice_line_id: invoiceLineId, allocated_quantity: quantity },
        mutationHeaders(revision),
      ),
    createSession: (caseId: string, subjectId: string, revision: number) =>
      api.post<{ capture_session_id: string; nonce: string; required_views: string[]; aggregate_revision: number }>(
        `${root}/cases/${caseId}/subjects/${subjectId}/capture-sessions`,
        {},
        mutationHeaders(revision, true),
      ),
    uploadEvidence: (
      caseId: string,
      sessionId: string,
      view: string,
      nonce: string,
      fingerprint: string,
      form: FormData,
    ) =>
      api.post(
        `${root}/cases/${caseId}/capture-sessions/${sessionId}/evidence?view=${encodeURIComponent(view)}`,
        form,
        {
          "X-Capture-Nonce": nonce,
          "X-Session-Fingerprint": fingerprint,
          "Idempotency-Key": crypto.randomUUID(),
        },
      ),
    completeSession: (caseId: string, sessionId: string, revision: number, nonce: string) =>
      api.post(
        `${root}/cases/${caseId}/capture-sessions/${sessionId}/complete`,
        { nonce },
        mutationHeaders(revision),
      ),
    analyze: (caseId: string, subjectId: string, revision: number, observed: Array<Record<string, unknown>>) =>
      api.post(
        `${root}/cases/${caseId}/subjects/${subjectId}/analyze`,
        { observed_attributes: observed, ai: { status: "NOT_USED" } },
        mutationHeaders(revision, true),
      ),
    review: (
      caseId: string,
      subjectId: string,
      revision: number,
      recommendation: "CLEAR" | "REJECT" | "REQUEST_EVIDENCE" | "REQUEST_EXCEPTION",
      reason: string,
    ) =>
      api.post(
        `${root}/cases/${caseId}/subjects/${subjectId}/review`,
        { recommendation, reason },
        mutationHeaders(revision, true),
      ),
    approveException: (caseId: string, recommendationId: string, revision: number, reason: string) =>
      api.post(
        `${root}/cases/${caseId}/exceptions/${recommendationId}/approve`,
        { reason },
        mutationHeaders(revision, true),
      ),
    reconsider: (caseId: string, subjectId: string, revision: number, reason: string) =>
      api.post(
        `${root}/cases/${caseId}/subjects/${subjectId}/reconsider`,
        { reason },
        mutationHeaders(revision, true),
      ),
  };
}
