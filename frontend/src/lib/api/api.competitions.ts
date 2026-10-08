type AuthedApi = {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
};

export function createCompetitionsApi(api: AuthedApi) {
  return {
    list: () => api.get<any[]>('/api/competitions'),
    entries: (competitionId?: string) =>
      api.get<any[]>(
        `/api/competitions/entries${competitionId ? `?competition_id=${competitionId}` : ''}`,
      ),
    funnel: () => api.get<any[]>('/api/competitions/funnel'),
    submit: (body: {
      competition_id: string;
      applicant_name?: string;
      applicant_email?: string;
      whitepaper_url?: string;
    }) => api.post('/api/competitions/entries', body),
    advance: (id: string, body: { stage: string; status?: string }) =>
      api.post(`/api/competitions/entries/${id}/advance`, body),
    goldenTicket: (id: string) => api.post(`/api/competitions/entries/${id}/golden-ticket`),
    channels: () => api.get<any[]>('/api/competitions/network/channels'),
    posts: (channelId: string) =>
      api.get<any[]>(`/api/competitions/network/channels/${channelId}/posts`),
    createPost: (body: { channel_id: string; body: string }) =>
      api.post('/api/competitions/network/posts', body),
    bounties: () => api.get<any[]>('/api/competitions/bounties'),
    claimBounty: (id: string) => api.post<any>(`/api/competitions/bounties/${id}/claim`, {}),
    payBounty: (id: string) => api.post<any>(`/api/competitions/bounties/${id}/pay`, {}),
    reopenBounty: (id: string) => api.post<any>(`/api/competitions/bounties/${id}/reopen`, {}),
  };
}
