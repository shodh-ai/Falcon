import { API_URL, apiFetch } from './client';

export const hostelAdminApi = {
  listHostels: (token: string) =>
    apiFetch<unknown[]>(token, { url: `${API_URL}/hostel-admin/hostels`, headers: {} }),

  dashboard: (token: string, hostelId?: string) =>
    apiFetch<unknown>(token, {
      url: `${API_URL}/hostel-admin/dashboard${hostelId ? `?hostelId=${hostelId}` : ''}`,
      headers: {},
    }),

  hostelDetail: (token: string, hostelId: string) =>
    apiFetch<unknown>(token, { url: `${API_URL}/hostel-admin/hostels/${hostelId}`, headers: {} }),

  students: (token: string, params?: { hostelId?: string; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.hostelId) q.set('hostelId', params.hostelId);
    if (params?.status) q.set('status', params.status);
    const qs = q.toString();
    return apiFetch<unknown[]>(token, {
      url: `${API_URL}/hostel-admin/students${qs ? `?${qs}` : ''}`,
      headers: {},
    });
  },

  gatePasses: (token: string, hostelId?: string) =>
    apiFetch<unknown[]>(token, {
      url: `${API_URL}/hostel-admin/gate-passes${hostelId ? `?hostelId=${hostelId}` : ''}`,
      headers: {},
    }),

  approveRequest: (token: string, requestId: string) =>
    apiFetch<unknown>(token, {
      url: `${API_URL}/hostel-admin/requests/${requestId}/approve`,
      method: 'PATCH',
      headers: {},
    }),

  fines: (token: string, hostelId?: string) =>
    apiFetch<unknown[]>(token, {
      url: `${API_URL}/hostel-admin/fines${hostelId ? `?hostelId=${hostelId}` : ''}`,
      headers: {},
    }),

  createFine: (token: string, body: Record<string, unknown>) =>
    apiFetch<unknown>(token, {
      url: `${API_URL}/hostel-admin/fines`,
      method: 'POST',
      headers: {},
      data: body,
    }),
};
