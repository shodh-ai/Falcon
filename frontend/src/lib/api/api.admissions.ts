import { API_URL, apiFetch } from './client';

export type LeadStage =
  | 'INQUIRY'
  | 'CONTACTED'
  | 'DOCUMENT_VERIFICATION'
  | 'APPLICATION_SUBMITTED'
  | 'OFFERED'
  | 'ENROLLED'
  | 'LOST';

export interface Lead {
  lead_id: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  stage: LeadStage;
  source?: string | null;
  preferred_program_id?: number | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export const admissionsApi = {
  listLeads: (token: string, stage?: LeadStage) =>
    apiFetch<Lead[]>(token, {
      url: `${API_URL}/admissions/leads${stage ? `?stage=${stage}` : ''}`,
      headers: {},
    }),
  createLead: (token: string, dto: Partial<Lead>) =>
    apiFetch<Lead>(token, { url: `${API_URL}/admissions/leads`, method: 'POST', headers: {}, data: dto }),
  updateStage: (token: string, leadId: string, stage: LeadStage) =>
    apiFetch<Lead>(token, {
      url: `${API_URL}/admissions/leads/${leadId}/stage`,
      method: 'PATCH',
      headers: {},
      data: { stage },
    }),
  listApplications: (token: string) =>
    apiFetch<unknown[]>(token, { url: `${API_URL}/admissions/applications`, headers: {} }),
  listDocuments: (token: string, applicationId: string) =>
    apiFetch<unknown[]>(token, {
      url: `${API_URL}/admissions/applications/${applicationId}/documents`,
      headers: {},
    }),
};
