import { describe, expect, it, vi } from 'vitest';
import { academicsApi } from '../api.academics';
import { apiFetch } from '../client';

vi.mock('../client', () => ({
  API_URL: 'http://api.test',
  apiFetch: vi.fn(),
}));

describe('student result API', () => {
  it('uses the authenticated result-history endpoint without a client student ID', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ exam_reports: [] });

    await academicsApi.studentResults('token-a');

    expect(apiFetch).toHaveBeenCalledWith('token-a', {
      url: 'http://api.test/api/academics/marks/history',
      headers: {},
    });
  });
});
