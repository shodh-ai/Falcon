type AuthedApi = {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
};

export type CertEvent = {
  event_id: string;
  event_name: string;
  application_start_date: string;
  application_end_date: string;
  base_fee: string | number;
  is_active: boolean;
  application_count?: number;
  verified_count?: number;
};

export type CertApplication = {
  application_id: string;
  event_id: string;
  event_name?: string;
  base_fee?: string | number;
  verification_status: string;
  certificate_generated: boolean;
  certificate_url?: string | null;
  finance_demand_id?: string | null;
  fee_status?: string | null;
  total_amount?: string | number | null;
  applied_at: string;
  student_name?: string;
  enrollment_no?: string;
};

export function createCertificateAutomationApi(api: AuthedApi) {
  return {
    activeEvent: () => api.get<CertEvent | null>('/api/certificate-automation/events/active'),
    listEvents: () => api.get<CertEvent[]>('/api/certificate-automation/events'),
    createEvent: (body: {
      event_name: string;
      application_start_date: string;
      application_end_date: string;
      base_fee: number;
      is_active?: boolean;
    }) => api.post<CertEvent>('/api/certificate-automation/events', body),
    myApplications: () => api.get<CertApplication[]>('/api/certificate-automation/applications/mine'),
    apply: (event_id: string) =>
      api.post<CertApplication & { payment_required?: boolean }>(
        '/api/certificate-automation/applications/apply',
        { event_id },
      ),
    pendingVerification: () =>
      api.get<CertApplication[]>('/api/certificate-automation/applications/pending-verification'),
    eventApplications: (eventId: string) =>
      api.get<CertApplication[]>(`/api/certificate-automation/events/${eventId}/applications`),
    verify: (id: string, action: 'approve' | 'reject') =>
      api.post(`/api/certificate-automation/applications/${id}/verify`, { action }),
    generateCertificates: (eventId: string) =>
      api.post<{ job_id: string; queued_count: number; status: string }>(
        `/api/certificate-automation/events/${eventId}/generate-certificates`,
      ),
  };
}
