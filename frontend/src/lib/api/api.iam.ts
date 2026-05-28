import { API_URL, apiFetch } from './client';

export interface Campus {
  campus_id: number;
  campus_name: string;
  campus_code?: string | null;
  address?: string | null;
}

export interface School {
  school_id: number;
  school_name: string;
  school_code?: string | null;
  campus_id?: number | null;
}

export interface Program {
  program_id: number;
  program_name: string;
  program_code: string;
  duration_years?: number | null;
  school_id?: number | null;
  dept_id?: number | null;
}

export const iamApi = {
  listCampuses: (token: string) => apiFetch<Campus[]>(token, { url: `${API_URL}/iam/campuses`, headers: {} }),
  createCampus: (token: string, dto: Partial<Campus>) =>
    apiFetch<Campus>(token, { url: `${API_URL}/iam/campuses`, method: 'POST', headers: {}, data: dto }),
  listSchools: (token: string) => apiFetch<School[]>(token, { url: `${API_URL}/iam/schools`, headers: {} }),
  createSchool: (token: string, dto: Partial<School>) =>
    apiFetch<School>(token, { url: `${API_URL}/iam/schools`, method: 'POST', headers: {}, data: dto }),
  listPrograms: (token: string) => apiFetch<Program[]>(token, { url: `${API_URL}/iam/programs`, headers: {} }),
  createProgram: (token: string, dto: Partial<Program>) =>
    apiFetch<Program>(token, { url: `${API_URL}/iam/programs`, method: 'POST', headers: {}, data: dto }),
};
