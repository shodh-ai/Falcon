import { API_URL, apiFetch } from './client';

export interface GatePass {
  pass_id: string;
  student_user_id: string;
  reason: string;
  expected_exit_at: string;
  expected_return_at: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXITED' | 'RETURNED' | 'EXPIRED';
  qr_token?: string | null;
}

export const operationsApi = {
  listRooms: (token: string) =>
    apiFetch<unknown[]>(token, { url: `${API_URL}/operations/hostel/rooms`, headers: {} }),
  requestGatePass: (
    token: string,
    payload: { student_user_id: string; reason: string; expected_exit_at: string; expected_return_at: string },
  ) =>
    apiFetch<GatePass>(token, {
      url: `${API_URL}/operations/gate-passes`,
      method: 'POST',
      headers: {},
      data: payload,
    }),
  approveGatePass: (token: string, passId: string) =>
    apiFetch<GatePass>(token, {
      url: `${API_URL}/operations/gate-passes/${passId}/approve`,
      method: 'PATCH',
      headers: {},
    }),
  listGatePasses: (token: string, studentUserId?: string) =>
    apiFetch<GatePass[]>(token, {
      url: `${API_URL}/operations/gate-passes${studentUserId ? `?studentUserId=${studentUserId}` : ''}`,
      headers: {},
    }),
  listBooks: (token: string) =>
    apiFetch<unknown[]>(token, { url: `${API_URL}/operations/library/books`, headers: {} }),
  listRoutes: (token: string) =>
    apiFetch<unknown[]>(token, { url: `${API_URL}/operations/transport/routes`, headers: {} }),
};
