import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { getSubdomainFromClient } from '@/lib/tenant';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...tenantHeaders(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
  });

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
  return (await response.json()) as T;
}

export const api = {
  login: () => {
    const tenant = getSubdomainFromClient();
    return `${API_URL}/auth/google?tenant=${encodeURIComponent(tenant)}`;
  },
};

export function useAuthedApi() {
  const { token } = useAuth();
  const router = useRouter();

  return useMemo(
    () => ({
      get: <T>(path: string) => request<T>(token, router, path, 'GET'),
      post: <T>(path: string, body?: unknown) => request<T>(token, router, path, 'POST', body),
      patch: <T>(path: string, body?: unknown) => request<T>(token, router, path, 'PATCH', body),
      put: <T>(path: string, body?: unknown) => request<T>(token, router, path, 'PUT', body),
      del: <T>(path: string) => request<T>(token, router, path, 'DELETE'),
    }),
    [token, router],
  );
}
