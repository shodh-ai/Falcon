type AuthedApi = {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
  patch?: <T>(path: string, body?: unknown) => Promise<T>;
};

export function createMoonshotsApi(api: AuthedApi) {
  return {
    programs: () => api.get<any[]>('/api/moonshots/programs'),
    projects: () => api.get<any[]>('/api/moonshots/projects'),
    mine: () => api.get<any[]>('/api/moonshots/projects/mine'),
    create: (body: { program_id: string; title: string; disclosure_notes?: string }) =>
      api.post('/api/moonshots/projects', body),
    updateStatus: (id: string, body: { status: string; ip_agreement_id?: string }) =>
      (api.patch ?? api.post)<any>(`/api/moonshots/projects/${id}/status`, body),
  };
}
