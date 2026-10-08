type AuthedApi = {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
};

export function createSpecialProgramsApi(api: AuthedApi) {
  return {
    list: () => api.get<any[]>('/api/special-programs'),
    enrollments: (code?: string) =>
      api.get<any[]>(`/api/special-programs/enrollments${code ? `?code=${code}` : ''}`),
    enroll: (body: { program_id: string; student_user_id?: string; metadata?: Record<string, unknown> }) =>
      api.post('/api/special-programs/enroll', body),
    pop: () => api.get<any[]>('/api/special-programs/pop'),
    upsertPop: (body: Record<string, unknown>) => api.post('/api/special-programs/pop', body),
    artifacts: (studentUserId?: string) =>
      api.get<any[]>(
        `/api/special-programs/portfolio/artifacts${studentUserId ? `?student_user_id=${studentUserId}` : ''}`,
      ),
    addArtifact: (body: Record<string, unknown>) =>
      api.post('/api/special-programs/portfolio/artifacts', body),
    publishTranscript: (body: { student_user_id?: string; mode?: string }) =>
      api.post('/api/special-programs/portfolio/publish', body),
    hsDirect: () => api.get<any[]>('/api/special-programs/hs-direct'),
    createHsDirect: (body: Record<string, unknown>) =>
      api.post('/api/special-programs/hs-direct', body),
  };
}
