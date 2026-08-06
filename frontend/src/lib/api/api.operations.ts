type AuthedApi = {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
  put?: <T>(path: string, body?: unknown) => Promise<T>;
};

export function createOperationsApi(api: AuthedApi) {
  return {
    dashboard: () => api.get<any>('/api/operations/dashboard'),
    queues: () => api.get<any[]>('/api/operations/esm/queues'),
    locations: () => api.get<any[]>('/api/operations/esm/locations'),
    fromQr: (body: { qr_code: string; subject?: string }) =>
      api.post('/api/operations/esm/from-qr', body),
    scanClose: (id: string) => api.post(`/api/operations/esm/tickets/${id}/scan-close`),
    tickets: () => api.get<any[]>('/api/operations/esm/tickets'),
    dofa: () => api.get<any[]>('/api/operations/p2p/dofa'),
    dofaLevels: () => api.get<any[]>('/api/operations/p2p/dofa/levels'),
    purchaseOrders: () => api.get<any[]>('/api/operations/p2p/purchase-orders'),
    createPo: (body: { description: string; amount: number; vendor_id?: string }) =>
      api.post<any>('/api/operations/p2p/purchase-orders', body),
    grns: () => api.get<any[]>('/api/operations/p2p/grn'),
    vendors: () => api.get<any[]>('/api/operations/p2p/vendors'),
    createGrn: (body: { po_id: string; notes?: string }) =>
      api.post('/api/operations/p2p/grn', body),
    createInvoice: (poId: string) =>
      api.post(`/api/operations/p2p/purchase-orders/${poId}/invoice`, {}),
    threeWayMatch: (id: string) =>
      api.get<any>(`/api/operations/p2p/purchase-orders/${id}/three-way-match`),
    payPo: (id: string) => api.post<any>(`/api/operations/p2p/purchase-orders/${id}/pay`),
    penalties: () => api.get<any[]>('/api/operations/p2p/penalties'),
    applyPenalty: (body: { vendor_id: string; reason: string; amount_inr: number }) =>
      api.post<any>('/api/operations/p2p/penalties', body),

    requisitions: (status?: string) =>
      api.get<any[]>(
        status
          ? `/api/operations/p2p/requisitions?status=${encodeURIComponent(status)}`
          : '/api/operations/p2p/requisitions',
      ),
    getRequisition: (id: string) => api.get<any>(`/api/operations/p2p/requisitions/${id}`),
    createRequisition: (body: {
      description: string;
      amount_estimate: number;
      dept_id?: number;
      technical_specs?: string;
      budget_id?: string;
      program_id?: string;
    }) => api.post<any>('/api/operations/p2p/requisitions', body),
    claimRequisition: (id: string) =>
      api.post<any>(`/api/operations/p2p/requisitions/${id}/claim`),
    addQuote: (
      id: string,
      body: {
        vendor_name: string;
        gstin: string;
        amount_inr: number;
        pdf_path: string;
        vendor_id?: string;
      },
    ) => api.post<any>(`/api/operations/p2p/requisitions/${id}/quotes`, body),
    submitForApproval: (
      id: string,
      body: { selected_quote_id: string; non_lowest_justification?: string },
    ) =>
      api.post<any>(
        `/api/operations/p2p/requisitions/${id}/submit-for-approval`,
        body,
      ),
    submitRequisition: (
      id: string,
      body: {
        selected_quote_id: string;
        l2_justification?: string;
        non_lowest_justification?: string;
      },
    ) => api.post<any>(`/api/operations/p2p/requisitions/${id}/submit`, body),
    approvalsInbox: () => api.get<any[]>('/api/operations/p2p/approvals/inbox'),
    approveRequisition: (
      id: string,
      body?: { notes?: string; decision?: 'APPROVED' | 'REJECTED' },
    ) => api.post<any>(`/api/operations/p2p/requisitions/${id}/approve`, body ?? {}),

    catalog: () => api.get<any[]>('/api/operations/p2p/catalog'),
    upsertCatalog: (body: {
      sku: string;
      name: string;
      category?: string;
      unit?: string;
      locked_unit_price: number;
      vendor_id: string;
      catalog_item_id?: string;
    }) => api.post<any>('/api/operations/p2p/catalog', body),
    orderCatalog: (body: { catalog_item_id: string; qty: number }) =>
      api.post<any>('/api/operations/p2p/catalog/order', body),

    fraudSignals: () => api.get<any>('/api/operations/p2p/analytics/fraud-signals'),
    invoiceSplitScan: () =>
      api.post<any>('/api/operations/p2p/analytics/invoice-split-scan'),
    verifyVendorGst: (id: string) =>
      api.post<any>(`/api/operations/p2p/vendors/${id}/verify-gst`),
    orgPillars: () => api.get<any>('/api/operations/org/pillars'),
  };
}
