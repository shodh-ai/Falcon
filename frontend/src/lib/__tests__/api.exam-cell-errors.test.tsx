import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthedApi } from '@/lib/api';

const mocks = vi.hoisted(() => ({ router: { replace: vi.fn() }, fetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'test-token' }) }));
vi.mock('@/lib/api-base-url', () => ({ getApiBaseUrl: () => 'http://api.test' }));
vi.mock('@/lib/tenant', () => ({ getSubdomainFromClient: () => 'test', rememberTenantSubdomain: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', mocks.fetch);
  // Old opt-in must not turn genuine failures into simulated successful operations.
  localStorage.setItem('exam_cell_dev_fallback', 'true');
});
afterEach(() => {
  localStorage.removeItem('exam_cell_dev_fallback');
  vi.unstubAllGlobals();
});

describe('Exam Cell API failures are never simulated successes', () => {
  it.each([
    '/api/exam-cell/sessions', '/api/exam-cell/exam-day/attendance',
    '/api/exam-cell/result-control/sessions/session-a/declare',
    '/api/exam-cell/notifications/send',
  ])('rejects failed writes to %s', async (path) => {
    mocks.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useAuthedApi());
    await expect(result.current.post(path, { status: 'PRESENT' })).rejects.toThrow('Cannot reach API');
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([404, 500, 502, 503, 504, 403])('propagates HTTP %s on reads and writes', async (status) => {
    mocks.fetch.mockImplementation(async () => new Response(JSON.stringify({ message: 'Request failed' }), { status }));
    const { result } = renderHook(() => useAuthedApi());
    await expect(result.current.get('/api/exam-cell/sessions')).rejects.toThrow();
    await expect(result.current.post('/api/exam-cell/sessions', {})).rejects.toThrow();
  });

  it('returns only the real server response, retaining authenticated tenant headers', async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify([{ session_id: 'actual-record' }]), { status: 200 }));
    const { result } = renderHook(() => useAuthedApi());
    await expect(result.current.get('/api/exam-cell/sessions')).resolves.toEqual([{ session_id: 'actual-record' }]);
    expect(mocks.fetch).toHaveBeenCalledWith('http://api.test/api/exam-cell/sessions', expect.objectContaining({
      headers: { Authorization: 'Bearer test-token', 'x-tenant-subdomain': 'test' },
    }));
  });

  it('preserves non-Exam Cell error handling', async () => {
    mocks.fetch.mockRejectedValue(new Error('Network unavailable'));
    const { result } = renderHook(() => useAuthedApi());
    await expect(result.current.get('/api/student-portal/marks')).rejects.toThrow('Network unavailable');
  });
});
