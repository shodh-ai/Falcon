export type ProcurementCaseSummary = {
  proc_case_id: string;
  acquisition_id: string;
  acquisition_version_id: string;
  acquisition_number: string;
  status: string;
  currency: string;
  approved_allocation: number | string;
  available_amount: number | string;
  committed_amount: number | string;
  expended_amount: number | string;
  released_amount: number | string;
  aggregate_revision: number;
  allocation_age_days: number;
  inactive_days: number;
  utilization_percent: number | string;
};

export type ProcurementCaseDetail = ProcurementCaseSummary & {
  requester_id: string;
  acquisition_snapshot_hash: string;
  budget_reservation_id: string;
  lines: Array<Record<string, unknown>>;
  orders: Array<Record<string, unknown>>;
  order_lines: Array<Record<string, unknown>>;
  receipts: Array<Record<string, unknown>>;
  receipt_lines: Array<Record<string, unknown>>;
  service_acceptances: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
  invoice_lines: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
  adjustments: Array<Record<string, unknown>>;
  returns: Array<Record<string, unknown>>;
  repairs: Array<Record<string, unknown>>;
  downstream_status: Array<Record<string, unknown>>;
  ledger: Array<Record<string, unknown>>;
  audit_timeline: Array<Record<string, unknown>>;
  integrity_projections: Array<Record<string, unknown>>;
  verified_unpaid_liability: number;
};

export type ProcurementDashboard = {
  approved_allocation: number;
  available_amount: number;
  committed_amount: number;
  expended_amount: number;
  released_amount: number;
  cases: number;
  alerts: Array<{ proc_case_id: string; type: string; value: number | string }>;
};

type Api = {
  get<T>(path: string, headers?: Record<string, string>): Promise<T>;
  getBlob?(path: string): Promise<Blob>;
  post<T>(
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T>;
};

export function createProcurementsApi(api: Api) {
  const root = "/api/procurements/v1";
  const mutationHeaders = (revision: number, key?: string) => ({
    "If-Match": String(revision),
    ...(key ? { "Idempotency-Key": key } : {}),
  });
  return {
    list: (status?: string) =>
      api.get<ProcurementCaseSummary[]>(
        `${root}/cases${status ? `?status=${encodeURIComponent(status)}` : ""}`,
      ),
    vendors: () => api.get<Array<{vendor_id:string;business_name:string;gstin?:string}>>(`${root}/vendors`),
    get: (caseId: string) =>
      api.get<ProcurementCaseDetail>(`${root}/cases/${caseId}`),
    dashboard: () => api.get<ProcurementDashboard>(`${root}/dashboard`),
    workbook: (caseId: string) => {
      if (!api.getBlob) throw new Error("Authenticated download is unavailable");
      return api.getBlob(`${root}/cases/${caseId}/workbook`);
    },
    sampleInvoice: () => {
      if (!api.getBlob) throw new Error("Authenticated download is unavailable");
      return api.getBlob(`${root}/sample-invoice`);
    },
    readiness: (caseId: string) =>
      api.get<Record<string, unknown>>(
        `${root}/cases/${caseId}/finalization-readiness`,
      ),
    previewWorkbook: (caseId: string, form: FormData) =>
      api.post<Record<string, unknown>>(
        `${root}/cases/${caseId}/imports/preview`,
        form,
      ),
    commitWorkbook: (caseId: string, previewId: string) =>
      api.post<Record<string, unknown>>(
        `${root}/cases/${caseId}/imports/${previewId}/commit`,
      ),
    createOrder: (caseId: string, revision: number, body: unknown) =>
      api.post(
        `${root}/cases/${caseId}/orders`,
        body,
        mutationHeaders(revision),
      ),
    issueOrder: (
      caseId: string,
      orderId: string,
      revision: number,
      key: string,
    ) =>
      api.post(
        `${root}/cases/${caseId}/orders/${orderId}/issue`,
        {},
        mutationHeaders(revision, key),
      ),
    cancelOrder: (
      caseId: string,
      orderId: string,
      revision: number,
      key: string,
      body: unknown,
    ) =>
      api.post(
        `${root}/cases/${caseId}/orders/${orderId}/cancel`,
        body,
        mutationHeaders(revision, key),
      ),
    recordReceipt: (
      caseId: string,
      orderId: string,
      revision: number,
      body: unknown,
    ) =>
      api.post(
        `${root}/cases/${caseId}/orders/${orderId}/receipts`,
        body,
        mutationHeaders(revision),
      ),
    serviceAcceptance: (caseId: string, revision: number, body: unknown) =>
      api.post(
        `${root}/cases/${caseId}/service-acceptances`,
        body,
        mutationHeaders(revision),
      ),
    createInvoice: (
      caseId: string,
      orderId: string,
      revision: number,
      body: unknown,
    ) =>
      api.post(
        `${root}/cases/${caseId}/orders/${orderId}/invoices`,
        body,
        mutationHeaders(revision),
      ),
    uploadInvoiceDocument: (caseId: string, form: FormData) =>
      api.post<{
        document_upload_id: string;
        content_hash: string;
        malware_scan_status: string;
      }>(`${root}/cases/${caseId}/invoice-documents`, form),
    uploadReceiptEvidence: (caseId: string, form: FormData) =>
      api.post<{
        document_upload_id: string;
        content_hash: string;
        malware_scan_status: string;
      }>(`${root}/cases/${caseId}/receipt-evidence`, form),
    confirmReceivedProduct: (
      caseId: string,
      receiptLineId: string,
      revision: number,
      documentUploadId: string,
    ) =>
      api.post(
        `${root}/cases/${caseId}/receipt-lines/${receiptLineId}/confirm-product`,
        { document_upload_id: documentUploadId },
        mutationHeaders(revision),
      ),
    verifyInvoice: (caseId: string, invoiceId: string, revision: number) =>
      api.post(
        `${root}/cases/${caseId}/invoices/${invoiceId}/verify`,
        {},
        mutationHeaders(revision),
      ),
    postPayment: (
      caseId: string,
      invoiceId: string,
      revision: number,
      key: string,
      body: unknown,
    ) =>
      api.post(
        `${root}/cases/${caseId}/invoices/${invoiceId}/payments`,
        body,
        mutationHeaders(revision, key),
      ),
    createReturn: (caseId: string, revision: number, body: unknown) =>
      api.post(
        `${root}/cases/${caseId}/returns`,
        body,
        mutationHeaders(revision),
      ),
    transitionReturn: (
      caseId: string,
      returnId: string,
      revision: number,
      status: string,
    ) =>
      api.post(
        `${root}/cases/${caseId}/returns/${returnId}/transition`,
        { status },
        mutationHeaders(revision),
      ),
    createAdjustment: (caseId: string, revision: number, body: unknown) =>
      api.post(
        `${root}/cases/${caseId}/adjustments`,
        body,
        mutationHeaders(revision),
      ),
    postAdjustment: (
      caseId: string,
      adjustmentId: string,
      revision: number,
      key: string,
    ) =>
      api.post(
        `${root}/cases/${caseId}/adjustments/${adjustmentId}/post`,
        {},
        mutationHeaders(revision, key),
      ),
    finalize: (caseId: string, revision: number, key: string) =>
      api.post(
        `${root}/cases/${caseId}/finalize`,
        {},
        mutationHeaders(revision, key),
      ),
  };
}
