import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../AuthContext';
import { useLayoutEffect } from 'react';

const fixtures = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/lib/api-base-url', () => ({ getApiBaseUrl: () => 'http://runtime-api.test' }));
vi.mock('@/lib/tenant', () => ({ getSubdomainFromClient: () => 'test' }));
const first = { user_id: 'faculty-1', name: 'First Faculty', email: 'first@test.edu', role: 'Faculty' };
const second = { user_id: 'faculty-2', name: 'Second Faculty', email: 'second@test.edu', role: 'Faculty' };
let current!: ReturnType<typeof useAuth>;
function Probe() {
  const auth = useAuth();
  useLayoutEffect(() => { current = auth; }, [auth]);
  return <><p>{auth.user?.name ?? 'Signed out'}</p><p>{auth.isLoading ? 'Loading account' : 'Account ready'}</p></>;
}
function response(data: unknown) { return { ok: true, json: async () => data }; }
async function ready() {
  render(<AuthProvider><Probe /></AuthProvider>);
  await screen.findByText('Account ready');
}
beforeEach(() => {
  localStorage.clear();
  fixtures.fetch = vi.fn().mockImplementation(async (path: string) => response(path.endsWith('/permissions') ? { permissions: ['read'], allowed_entities: [{ id: 1, name: 'Campus', code: 'C' }] } : { ...first, name: 'Refreshed Faculty' }));
  vi.stubGlobal('fetch', fixtures.fetch);
});
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

describe('auth refresh account ownership', () => {
  it.each(['login', 'logout', 'same-session-login'] as const)('rejects an old onboarding completion after %s', async (change) => {
    await ready();
    act(() => current.login('token-1', first));
    const completeOldOnboarding = current.updateOnboardingStatus;
    act(() => {
      if (change === 'logout') current.logout();
      else if (change === 'same-session-login') current.login('token-1', first);
      else current.login('token-2', second);
    });
    const cachedAccount = localStorage.getItem('user');
    act(() => { expect(completeOldOnboarding('COMPLETED')).toBe(false); });
    expect(localStorage.getItem('user')).toBe(cachedAccount);
    expect(current.user?.onboarding_status).toBeUndefined();
  });

  it('updates onboarding on the latest refreshed profile without replacing its fields with an old snapshot', async () => {
    await ready();
    act(() => current.login('token-1', first));
    const completeOnboarding = current.updateOnboardingStatus;
    await act(async () => { await current.refreshUser(); });
    act(() => { expect(completeOnboarding('PENDING_DOCUMENTS')).toBe(true); });
    expect(current.user).toEqual(expect.objectContaining({ name: 'Refreshed Faculty', onboarding_status: 'PENDING_DOCUMENTS', permissions: ['read'] }));
    expect(JSON.parse(localStorage.getItem('user')!)).toEqual(current.user);
  });

  it('does not let an older pending profile refresh undo an authoritative onboarding transition', async () => {
    await ready(); act(() => current.login('token-1', first));
    let resolve!: (value: ReturnType<typeof response>) => void;
    fixtures.fetch.mockImplementation((path: string) => path.endsWith('/permissions') ? Promise.resolve(response({})) : new Promise<ReturnType<typeof response>>((done) => { resolve = done; }));
    let refresh!: ReturnType<typeof current.refreshUser>;
    act(() => { refresh = current.refreshUser(); });
    await waitFor(() => expect(resolve).toBeTypeOf('function'));
    act(() => { expect(current.updateOnboardingStatus('PENDING_DOCUMENTS')).toBe(true); });
    await act(async () => { resolve(response({ ...first, onboarding_status: 'PENDING_PASSWORD_RESET' })); expect(await refresh).toBeNull(); });
    expect(current.user?.onboarding_status).toBe('PENDING_DOCUMENTS');
  });

  it.each(['{broken json', 'null', '{}'])('clears malformed cached authentication (%s)', async (cached) => {
    localStorage.setItem('token', 'token-1');
    localStorage.setItem('user', cached);
    await ready();
    expect(current.user).toBeNull();
    expect(current.token).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
    expect(fixtures.fetch).not.toHaveBeenCalled();
  });
  it('refreshes the active user while preserving tenant and permissions enrichment', async () => {
    await ready();
    act(() => current.login('token-1', first));
    await act(async () => { await current.refreshUser(); });
    expect(current.user).toEqual(expect.objectContaining({ name: 'Refreshed Faculty', tenant_subdomain: 'test', permissions: ['read'], allowed_entities: [{ id: 1, name: 'Campus', code: 'C' }] }));
    expect(JSON.parse(localStorage.getItem('user')!)).toEqual(current.user);
  });

  it.each(['login', 'logout'] as const)('does not apply a pending refresh after %s changes the authentication generation', async (change) => {
    await ready();
    act(() => current.login('token-1', first));
    let resolve!: (value: ReturnType<typeof response>) => void;
    fixtures.fetch.mockImplementation((path: string) => path.endsWith('/permissions') ? Promise.resolve(response({ permissions: ['old'] })) : new Promise<ReturnType<typeof response>>((done) => { resolve = done; }));
    let refresh!: ReturnType<typeof current.refreshUser>;
    act(() => { refresh = current.refreshUser(); });
    await waitFor(() => expect(fixtures.fetch).toHaveBeenCalledTimes(2));
    act(() => { if (change === 'login') current.login('token-2', second); else current.logout(); });
    await act(async () => { resolve(response({ ...first, name: 'Stale old account' })); expect(await refresh).toBeNull(); });
    expect(current.user).toEqual(change === 'login' ? second : null);
    expect(localStorage.getItem('token')).toBe(change === 'login' ? 'token-2' : null);
    expect(localStorage.getItem('user')).toBe(change === 'login' ? JSON.stringify(second) : null);
  });

  it('refuses a captured old refresh callback after another account signs in', async () => {
    await ready();
    act(() => current.login('token-1', first));
    const oldRefresh = current.refreshUser;
    act(() => current.login('token-2', second));
    await expect(oldRefresh()).resolves.toBeNull();
    expect(fixtures.fetch).not.toHaveBeenCalled();
    expect(current.user).toEqual(second);
  });

  it('keeps the newest refresh when overlapping responses arrive out of order', async () => {
    await ready();
    act(() => current.login('token-1', first));
    const pending: Array<(value: ReturnType<typeof response>) => void> = [];
    fixtures.fetch.mockImplementation((path: string) => path.endsWith('/permissions') ? Promise.resolve(response({})) : new Promise<ReturnType<typeof response>>((done) => pending.push(done)));
    let oldRefresh!: ReturnType<typeof current.refreshUser>;
    let newRefresh!: ReturnType<typeof current.refreshUser>;
    act(() => { oldRefresh = current.refreshUser(); });
    await waitFor(() => expect(pending).toHaveLength(1));
    act(() => { newRefresh = current.refreshUser(); });
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => { pending[1](response({ ...first, name: 'Newest snapshot' })); await newRefresh; });
    await act(async () => { pending[0](response({ ...first, name: 'Old snapshot' })); expect(await oldRefresh).toBeNull(); });
    expect(current.user?.name).toBe('Newest snapshot');
    expect(JSON.parse(localStorage.getItem('user')!).name).toBe('Newest snapshot');
  });

  it('does not apply old account JSON if the session changes while parsing the response', async () => {
    await ready();
    act(() => current.login('token-1', first));
    let resolveJson!: (value: typeof first) => void;
    fixtures.fetch.mockImplementation(async (path: string) => path.endsWith('/permissions') ? response({}) : { ok: true, json: () => new Promise<typeof first>((done) => { resolveJson = done; }) });
    let refresh!: ReturnType<typeof current.refreshUser>;
    act(() => { refresh = current.refreshUser(); });
    await waitFor(() => expect(resolveJson).toBeTypeOf('function'));
    act(() => current.login('token-2', second));
    await act(async () => { resolveJson(first); expect(await refresh).toBeNull(); });
    expect(current.user).toEqual(second);
  });

  it('keeps a new login when the initial cached-account bootstrap completes later', async () => {
    localStorage.setItem('token', 'token-1');
    localStorage.setItem('user', JSON.stringify(first));
    let resolve!: (value: ReturnType<typeof response>) => void;
    fixtures.fetch.mockImplementation((path: string) => path.endsWith('/permissions') ? Promise.resolve(response({})) : new Promise<ReturnType<typeof response>>((done) => { resolve = done; }));
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(fixtures.fetch).toHaveBeenCalledTimes(2));
    act(() => current.login('token-2', second));
    await act(async () => { resolve(response(first)); });
    await screen.findByText('Account ready');
    expect(current.user).toEqual(second);
    expect(localStorage.getItem('user')).toBe(JSON.stringify(second));
  });
});
