import { describe, expect, it, vi } from 'vitest';
import { examsApi } from '../api.exams';
import { apiFetch } from '../client';

vi.mock('../client', () => ({ API_URL: 'http://api.test', apiFetch: vi.fn() }));

describe('issued student hall-ticket API', () => {
  it('uses authenticated identity, with no client student or tenant ID', async () => {
    vi.mocked(apiFetch).mockResolvedValue([]);
    await examsApi.issuedAdmitCards('fixture-token');
    expect(apiFetch).toHaveBeenCalledWith('fixture-token', {
      url: 'http://api.test/api/academics/exams/admit-cards', headers: {},
    });
  });

  it('propagates an unavailable issued-ticket service instead of inventing an empty success', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('Issued tickets unavailable'));
    await expect(examsApi.issuedAdmitCards('fixture-token')).rejects.toThrow('Issued tickets unavailable');
  });
});
