import { API_URL, apiFetch } from './client';

export interface CsvImportResult {
  total_rows: number;
  imported: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

export const settingsApi = {
  importUsers: (token: string, target: 'users' | 'students' | 'staff', file: File) => {
    const form = new FormData();
    form.append('file', file);
    form.append('target', target);
    return apiFetch<CsvImportResult>(token, {
      url: `${API_URL}/settings/import/users`,
      method: 'POST',
      headers: {},
      data: form,
    });
  },
};
