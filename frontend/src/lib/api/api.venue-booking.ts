type AuthedApi = {
  get: <T>(url: string) => Promise<T>;
  post: <T>(url: string, body?: unknown) => Promise<T>;
};

export type CampusVenue = {
  venue_id: string;
  name: string;
  capacity: number;
  amenities: string[];
  approver_role: string;
  max_duration_mins: number;
};

export type VenueBookingSlot = {
  booking_id: string;
  start_time: string;
  end_time: string;
  status: string;
  purpose: string;
  student_name?: string;
};

export type VenueAvailability = {
  venue: { venue_id: string; name: string; max_duration_mins: number };
  bookings: VenueBookingSlot[];
};

export type VenueBooking = {
  booking_id: string;
  venue_id: string;
  venue_name: string;
  start_time: string;
  end_time: string;
  purpose: string;
  status: string;
  approver_remarks: string | null;
  qr_token: string | null;
  created_at: string;
};

export type VenueBookingPass = {
  booking_id: string;
  venue_name: string;
  student_name: string;
  start_time: string;
  end_time: string;
  qr_payload: string;
};

export type PendingVenueBooking = {
  booking_id: string;
  start_time: string;
  end_time: string;
  purpose: string;
  status: string;
  created_at: string;
  venue_name: string;
  approver_role: string;
  student_name: string;
  semester: number | null;
};

export function createVenueBookingApi(api: AuthedApi) {
  return {
    listVenues: (tags?: string[]) => {
      const qs = tags?.length ? `?${tags.map(t => `tags=${encodeURIComponent(t)}`).join('&')}` : '';
      return api.get<CampusVenue[]>(`/api/venue-bookings/venues${qs}`);
    },
    amenityTags: () => api.get<string[]>('/api/venue-bookings/amenity-tags'),
    availability: (venueId: string, date: string) =>
      api.get<VenueAvailability>(`/api/venue-bookings/venues/${venueId}/availability?date=${encodeURIComponent(date)}`),
    myBookings: () => api.get<VenueBooking[]>('/api/venue-bookings/my'),
    bookingPass: (bookingId: string) =>
      api.get<VenueBookingPass>(`/api/venue-bookings/my/${bookingId}/pass`),
    createBooking: (body: { venue_id: string; start_time: string; end_time: string; purpose: string }) =>
      api.post<VenueBooking>('/api/venue-bookings', body),
    librarianPending: () => api.get<PendingVenueBooking[]>('/api/venue-bookings/approvals/librarian/pending'),
    librarianApprove: (bookingId: string, remarks?: string) =>
      api.post(`/api/venue-bookings/approvals/librarian/${bookingId}/approve`, { remarks }),
    librarianReject: (bookingId: string, remarks?: string) =>
      api.post(`/api/venue-bookings/approvals/librarian/${bookingId}/reject`, { remarks }),
    hodPending: () => api.get<PendingVenueBooking[]>('/api/venue-bookings/approvals/hod/pending'),
    hodApprove: (bookingId: string, remarks?: string) =>
      api.post(`/api/venue-bookings/approvals/hod/${bookingId}/approve`, { remarks }),
    hodReject: (bookingId: string, remarks?: string) =>
      api.post(`/api/venue-bookings/approvals/hod/${bookingId}/reject`, { remarks }),
    estatePending: () => api.get<PendingVenueBooking[]>('/api/venue-bookings/approvals/estate/pending'),
    estateApprove: (bookingId: string, remarks?: string) =>
      api.post(`/api/venue-bookings/approvals/estate/${bookingId}/approve`, { remarks }),
    estateReject: (bookingId: string, remarks?: string) =>
      api.post(`/api/venue-bookings/approvals/estate/${bookingId}/reject`, { remarks }),
  };
}
