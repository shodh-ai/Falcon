import { API_URL, apiFetch } from './client';

export type LeaveType = 'CASUAL' | 'SICK' | 'EARNED' | 'MATERNITY' | 'PATERNITY' | 'LWP' | 'OTHER';
export type LeaveRequestStatus =
  | 'DRAFT'
  | 'PENDING_HOD'
  | 'PENDING_DEAN'
  | 'PENDING_HR'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export interface LeaveRequest {
  leave_request_id: string;
  requester_user_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  total_days: string;
  reason?: string | null;
  status: LeaveRequestStatus;
}

export const hrApi = {
  createLeave: (token: string, dto: Partial<LeaveRequest>) =>
    apiFetch<LeaveRequest>(token, { url: `${API_URL}/hr/leaves`, method: 'POST', headers: {}, data: dto }),
  listLeaves: (token: string, opts: { userId?: string; status?: LeaveRequestStatus } = {}) => {
    const params = new URLSearchParams();
    if (opts.userId) params.set('userId', opts.userId);
    if (opts.status) params.set('status', opts.status);
    const qs = params.toString();
    return apiFetch<LeaveRequest[]>(token, { url: `${API_URL}/hr/leaves${qs ? `?${qs}` : ''}`, headers: {} });
  },
  actOnLeave: (
    token: string,
    leaveId: string,
    payload: { action: 'APPROVE' | 'REJECT'; actor_user_id: string; comment?: string },
  ) =>
    apiFetch<LeaveRequest>(token, {
      url: `${API_URL}/hr/leaves/${leaveId}/action`,
      method: 'PATCH',
      headers: {},
      data: payload,
    }),
  balances: (token: string, userId: string) =>
    apiFetch<unknown[]>(token, { url: `${API_URL}/hr/balances/${userId}`, headers: {} }),
};
