type AuthedApi = {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
  del?: <T>(path: string) => Promise<T>;
};

export type CampusEvent = {
  event_id: string;
  title: string;
  description?: string;
  guest_speakers?: string;
  venue?: string;
  venue_id?: string;
  venue_asset_name?: string;
  venue_clash?: { has_clash: boolean; conflicts: { title: string; event_date: string }[] };
  event_date: string;
  total_slots: number;
  available_slots: number;
  pending_holds: number;
  bookable_slots?: number;
  is_paid: boolean;
  ticket_price: string | number;
  status: string;
  advisor_approval?: string;
  estate_approval?: string;
  finance_approval?: string;
  estate_notes?: string;
  club_name?: string;
  capacity_percent?: number;
};

export type BlockedDate = { date: string; title: string };
export type Venue = { venue_id: string; name: string; location_label?: string };

export type EventRegistration = {
  registration_id: string;
  event_id: string;
  status: string;
  qr_code?: string;
  attended?: boolean;
  hold_expires_at?: string;
  title?: string;
  venue?: string;
  event_date?: string;
  club_name?: string;
  ticket_price?: string | number;
};

export type RegisterResponse = {
  registration: EventRegistration;
  checkout_required: boolean;
  order?: {
    order_id: string;
    registration_id: string;
    amount_inr: number;
    fee_head: string;
    razorpay_key: string;
    notes: Record<string, string>;
  };
  expires_at?: string;
  server_now?: string;
  remaining_seconds?: number;
  lock_ttl_seconds?: number;
};

export function createCampusEventsApi(api: AuthedApi) {
  return {
    listEvents: () => api.get<CampusEvent[]>('/api/campus-events/events'),
    globalCalendar: () =>
      api.get<{ live_events: CampusEvent[]; blocked_dates: BlockedDate[] }>(
        '/api/campus-events/calendar/global',
      ),
    blockedDates: () => api.get<BlockedDate[]>('/api/campus-events/blocked-dates'),
    venues: () => api.get<Venue[]>('/api/campus-events/venues'),
    getEvent: (id: string) => api.get<CampusEvent>(`/api/campus-events/events/${id}`),
    register: (eventId: string) =>
      api.post<RegisterResponse>(`/api/campus-events/events/${eventId}/register`, {}),
    getRegistration: (registrationId: string) =>
      api.get<RegisterResponse>(`/api/campus-events/registrations/${registrationId}`),
    confirmPayment: (eventId: string, registrationId: string, paymentRef: string) =>
      api.post<{ confirmed: boolean; registration: EventRegistration }>(
        `/api/campus-events/events/${eventId}/register/confirm`,
        { registration_id: registrationId, payment_ref: paymentRef },
      ),
    myTickets: () => api.get<EventRegistration[]>('/api/campus-events/my-tickets'),
    isClubCoordinator: () =>
      api.get<{ is_coordinator: boolean }>('/api/campus-events/me/club-coordinator'),
    myClubs: () => api.get<{ club_id: string; name: string }[]>('/api/campus-events/coordinator/clubs'),
    coordinatorEvents: () => api.get<CampusEvent[]>('/api/campus-events/coordinator/events'),
    proposeEvent: (body: Record<string, unknown>) =>
      api.post('/api/campus-events/coordinator/events', body),
    scanTicket: (eventId: string, qrCode: string) =>
      api.post<{ scanned: boolean; student_name: string; duplicate?: boolean }>(
        `/api/campus-events/coordinator/events/${eventId}/scan`,
        { qr_code: qrCode },
      ),
    scanStats: (eventId: string) =>
      api.get<{ registered: number; attended: number }>(
        `/api/campus-events/coordinator/events/${eventId}/scan-stats`,
      ),
    pendingApprovals: () => api.get<CampusEvent[]>('/api/campus-events/approvals/pending'),
    approveAdvisor: (id: string) => api.post(`/api/campus-events/approvals/${id}/approve`, {}),
    rejectAdvisor: (id: string, comment: string) =>
      api.post(`/api/campus-events/approvals/${id}/reject`, { comment }),
    estatePending: () => api.get<CampusEvent[]>('/api/campus-events/estate/pending'),
    approveEstate: (id: string, body: Record<string, unknown>) =>
      api.post(`/api/campus-events/estate/${id}/approve`, body),
    rejectEstate: (id: string, comment: string) =>
      api.post(`/api/campus-events/estate/${id}/reject`, { comment }),
    financePending: () => api.get<CampusEvent[]>('/api/campus-events/finance-approvals/pending'),
    approveFinance: (id: string, ledgerCode?: string) =>
      api.post(`/api/campus-events/finance-approvals/${id}/approve`, { ledger_code: ledgerCode }),
    rejectFinance: (id: string, comment: string) =>
      api.post(`/api/campus-events/finance-approvals/${id}/reject`, { comment }),
    masterCalendar: (academicYear?: string) =>
      api.get<
        {
          calendar_id: string;
          date: string;
          title: string;
          description?: string;
          is_blocked_for_events: boolean;
        }[]
      >(`/api/campus-events/master-calendar${academicYear ? `?academic_year=${academicYear}` : ''}`),
    upsertCalendar: (body: Record<string, unknown>) =>
      api.post('/api/campus-events/master-calendar', body),
    deleteCalendar: (id: string) =>
      (api.del ?? api.post)<{ deleted: boolean }>(`/api/campus-events/master-calendar/${id}`),
    attendeesCsv: (eventId: string) =>
      api.get<string>(`/api/campus-events/coordinator/events/${eventId}/attendees.csv`),
  };
}
