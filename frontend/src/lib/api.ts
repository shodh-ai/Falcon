import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { getSubdomainFromClient } from '@/lib/tenant';
import { getApiBaseUrl } from '@/lib/api-base-url';

let authRedirectInFlight = false;

function scheduleAuthRedirect(router: ReturnType<typeof useRouter>) {
  if (typeof window === 'undefined' || authRedirectInFlight) return;
  authRedirectInFlight = true;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.setTimeout(() => {
    try {
      router.replace('/login');
    } catch {
      window.location.assign('/login');
    }
  }, 0);
}

function wrapFetchError(err: unknown, path: string): Error {
  if (err instanceof TypeError && err.message === 'Failed to fetch') {
    return new Error(`Cannot reach API at ${getApiBaseUrl()}${path}. Check API_URL in Coolify or start the backend locally.`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

function tenantHeaders(): Record<string, string> {
  return { 'x-tenant-subdomain': getSubdomainFromClient() };
}

import { parseApiError, extractApiErrorMessage } from '@/lib/notifications/parse-api-error';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

async function request<T>(
  token: string | null,
  router: ReturnType<typeof useRouter>,
  path: string,
  method: Method = 'GET',
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      method,
      headers: {
        ...tenantHeaders(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...extraHeaders,
      },
      body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
    });
  } catch (err) {
    throw wrapFetchError(err, path);
  }

  if (response.status === 401) {
    scheduleAuthRedirect(router);
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(extractApiErrorMessage(text, response.status, path));
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  if (!text.trim()) return null as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Invalid JSON response from server');
  }
}

export const api = {
  login: () => {
    const tenant = getSubdomainFromClient();
    return `${getApiBaseUrl()}/auth/google?tenant=${encodeURIComponent(tenant)}`;
  },
  forgotPassword: async (email: string) => {
    const response = await fetch(`${getApiBaseUrl()}/api/auth/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...tenantHeaders(),
      },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(extractApiErrorMessage(text, response.status, '/api/auth/forgot-password'));
    }
    return response.json() as Promise<{ sent: true; reset_token?: string }>;
  },
  resetPasswordWithToken: async (token: string, newPassword: string) => {
    const response = await fetch(`${getApiBaseUrl()}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...tenantHeaders() },
      body: JSON.stringify({ token, new_password: newPassword }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(extractApiErrorMessage(text, response.status, '/api/auth/reset-password'));
    }
    return response.json() as Promise<{ success: true }>;
  },
  localLogin: async (email: string, password: string) => {
    const response = await fetch(`${getApiBaseUrl()}/api/auth/local-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...tenantHeaders(),
      },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(extractApiErrorMessage(text, response.status, '/api/auth/local-login'));
    }
    return response.json() as Promise<{
      token: string;
      user: {
        user_id: string;
        email: string;
        name: string;
        role: string;
        roles?: string[];
        primaryRole?: string;
        role_id?: number;
        department?: string;
        dept_id?: number;
        tenant_id?: string;
        tenant_schema?: string;
        onboarding_status?: string;
      };
    }>;
  },
};

export function useAuthedApi() {
  const { token } = useAuth();
  const router = useRouter();

  return useMemo(
    () => ({
      get: <T>(path: string, headers?: Record<string, string>) =>
        request<T>(token, router, path, 'GET', undefined, headers),
      post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
        request<T>(token, router, path, 'POST', body, headers),
      patch: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
        request<T>(token, router, path, 'PATCH', body, headers),
      put: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
        request<T>(token, router, path, 'PUT', body, headers),
      del: <T>(path: string, headers?: Record<string, string>) =>
        request<T>(token, router, path, 'DELETE', undefined, headers),
    }),
    [token, router],
  );
}
