import { API_URL, apiFetch } from './client';

export interface JobPosting {
  job_id: string;
  company_name: string;
  role_title: string;
  ctc_lpa?: number | null;
  location?: string | null;
  one_student_one_job: boolean;
  status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'ARCHIVED';
  apply_deadline?: string | null;
}

export const iqacApi = {
  listJobs: (token: string) =>
    apiFetch<JobPosting[]>(token, { url: `${API_URL}/iqac/placements/jobs`, headers: {} }),
  createJob: (token: string, dto: Partial<JobPosting>) =>
    apiFetch<JobPosting>(token, {
      url: `${API_URL}/iqac/placements/jobs`,
      method: 'POST',
      headers: {},
      data: dto,
    }),
  applyToJob: (token: string, jobId: string, payload: { student_user_id: string; responses?: Record<string, unknown> }) =>
    apiFetch<unknown>(token, {
      url: `${API_URL}/iqac/placements/jobs/${jobId}/apply`,
      method: 'POST',
      headers: {},
      data: payload,
    }),
  listAlumniRequests: (token: string, alumniUserId?: string) =>
    apiFetch<unknown[]>(token, {
      url: `${API_URL}/iqac/alumni/requests${alumniUserId ? `?alumniUserId=${alumniUserId}` : ''}`,
      headers: {},
    }),
  createAlumniRequest: (token: string, dto: Record<string, unknown>) =>
    apiFetch<unknown>(token, {
      url: `${API_URL}/iqac/alumni/requests`,
      method: 'POST',
      headers: {},
      data: dto,
    }),
};
