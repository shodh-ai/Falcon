type AuthedApi = {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
};

export function createLabsApi(api: AuthedApi) {
  return {
    zones: () => api.get<any[]>('/api/labs/zones'),
    equipment: (zoneId?: string) =>
      api.get<any[]>(`/api/labs/equipment${zoneId ? `?zone_id=${zoneId}` : ''}`),
    checkouts: () => api.get<any[]>('/api/labs/checkouts'),
    checkout: (body: { equipment_id: string; safety_ack?: boolean }) =>
      api.post('/api/labs/checkout', body),
    returnCheckout: (id: string) => api.post(`/api/labs/checkouts/${id}/return`),
    partners: () => api.get<any[]>('/api/labs/partners'),
    workOrders: () => api.get<any[]>('/api/labs/work-orders'),
    createWorkOrder: (body: { partner_id: string; title: string; notes?: string }) =>
      api.post('/api/labs/work-orders', body),
    budget: () => api.get<any>('/api/labs/budget'),
  };
}
