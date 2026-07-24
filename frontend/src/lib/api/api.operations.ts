type AuthedApi = {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
};

export function createOperationsApi(api: AuthedApi) {
  return {
    dashboard: () => api.get<any>('/api/operations/dashboard'),
    queues: () => api.get<any[]>('/api/operations/esm/queues'),
    locations: () => api.get<any[]>('/api/operations/esm/locations'),
    fromQr: (body: { qr_code: string; subject?: string }) =>
      api.post('/api/operations/esm/from-qr', body),
    scanClose: (id: string) => api.post(`/api/operations/esm/tickets/${id}/scan-close`),
    dofa: () => api.get<any[]>('/api/operations/p2p/dofa'),
    purchaseOrders: () => api.get<any[]>('/api/operations/p2p/purchase-orders'),
    createPo: (body: { description: string; amount: number; vendor_id?: string }) =>
      api.post('/api/operations/p2p/purchase-orders', body),
    grns: () => api.get<any[]>('/api/operations/p2p/grn'),
    createGrn: (body: { po_id: string; notes?: string }) =>
      api.post('/api/operations/p2p/grn', body),
    threeWayMatch: (id: string) =>
      api.get<any>(`/api/operations/p2p/purchase-orders/${id}/three-way-match`),
    payPo: (id: string) => api.post(`/api/operations/p2p/purchase-orders/${id}/pay`),
    penalties: () => api.get<any[]>('/api/operations/p2p/penalties'),
    applyPenalty: (body: { vendor_id: string; reason: string; amount_inr: number }) =>
      api.post('/api/operations/p2p/penalties', body),
  };
}
