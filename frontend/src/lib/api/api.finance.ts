import { API_URL, apiFetch } from './client';

export type FeeDemandStatus = 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'WAIVED';

export interface FeeDemand {
  demand_id: string;
  student_user_id: string;
  fee_head: string;
  academic_year: string;
  semester?: number | null;
  total_amount: string;
  paid_amount: string;
  due_date: string;
  status: FeeDemandStatus;
  fee_breakup?: Record<string, unknown> | null;
}

export const financeApi = {
  listDemands: (token: string, studentUserId?: string) =>
    apiFetch<FeeDemand[]>(token, {
      url: `${API_URL}/finance/demands${studentUserId ? `?studentUserId=${studentUserId}` : ''}`,
      headers: {},
    }),
  createDemand: (token: string, dto: Partial<FeeDemand>) =>
    apiFetch<FeeDemand>(token, {
      url: `${API_URL}/finance/demands`,
      method: 'POST',
      headers: {},
      data: dto,
    }),
  listTransactions: (token: string, studentUserId?: string) =>
    apiFetch<unknown[]>(token, {
      url: `${API_URL}/finance/transactions${studentUserId ? `?studentUserId=${studentUserId}` : ''}`,
      headers: {},
    }),
  listFinePolicies: (token: string) =>
    apiFetch<unknown[]>(token, { url: `${API_URL}/finance/fine-policies`, headers: {} }),
};
