import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { getSubdomainFromClient } from '@/lib/tenant';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function wrapFetchError(err: unknown, path: string): Error {
  if (err instanceof TypeError && err.message === 'Failed to fetch') {
    return new Error(`Cannot reach API at ${API_URL}${path}. Start the backend with: cd backend && npm run start:dev`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

function tenantHeaders(): Record<string, string> {
  return { 'x-tenant-subdomain': getSubdomainFromClient() };
}

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
    response = await fetch(`${API_URL}${path}`, {
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
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
    router.replace('/login');
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Request failed with status ${response.status}`);
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
    return `${API_URL}/auth/google?tenant=${encodeURIComponent(tenant)}`;
  },
  localLogin: async (email: string, password: string) => {
    const response = await fetch(`${API_URL}/api/auth/local-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...tenantHeaders(),
      },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || 'Login failed');
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
