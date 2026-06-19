type AuthedApi = {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
  patch: <T>(path: string, body?: unknown) => Promise<T>;
};

export type MeetingParticipant = {
  participant_id: string;
  user_id: string;
  name: string;
  email: string;
  participant_role: string;
  rsvp_status: string;
  response_note?: string | null;
};

export type PortalMeetingRecord = {
  meeting_id: string;
  title: string;
  venue: string;
  starts_at: string;
  ends_at: string;
  agenda?: string | null;
  meeting_mode: 'SCHEDULED' | 'REQUESTED';
  status: string;
  organizer_user_id: string;
  organizer_name: string;
  requester_user_id: string;
  requester_name: string;
  participants: MeetingParticipant[];
  minutes?: {
    minutes_id: string;
    notes: string;
    decisions?: string | null;
    action_items?: string | null;
    published_at?: string | null;
  } | null;
};

export type EligibleParticipant = {
  user_id: string;
  name: string;
  email: string;
  role_name: string;
  dept_name?: string | null;
  relation: string;
};

export function createMeetingsApi(api: AuthedApi) {
  return {
    list: () => api.get<PortalMeetingRecord[]>('/api/meetings'),
    get: (id: string) => api.get<PortalMeetingRecord>(`/api/meetings/${id}`),
    eligible: (direction: 'schedule' | 'request') =>
      api.get<{ direction: string; participants: EligibleParticipant[] }>(
        `/api/meetings/eligible-participants?direction=${direction}`,
      ),
    schedule: (body: {
      title: string;
      venue: string;
      meeting_at: string;
      agenda?: string;
      invitee_user_ids: string[];
    }) => api.post<PortalMeetingRecord>('/api/meetings/schedule', body),
    request: (body: {
      title: string;
      venue: string;
      meeting_at: string;
      agenda?: string;
      recipient_user_id: string;
    }) => api.post<PortalMeetingRecord>('/api/meetings/request', body),
    respond: (id: string, body: { response: 'ACCEPTED' | 'DECLINED'; note?: string }) =>
      api.post<PortalMeetingRecord>(`/api/meetings/${id}/respond`, body),
    updateAgenda: (id: string, agenda: string) =>
      api.patch<PortalMeetingRecord>(`/api/meetings/${id}/agenda`, { agenda }),
    publishMinutes: (
      id: string,
      body: { notes: string; decisions?: string; action_items?: string },
    ) => api.post<PortalMeetingRecord>(`/api/meetings/${id}/minutes`, body),
  };
}
