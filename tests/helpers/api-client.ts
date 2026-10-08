import { testEnv } from './env';
import { TEST_PASSWORD } from './test-users';

export type ApiResponse<T = unknown> = {
  status: number;
  body: T;
  headers: Headers;
};

export function tenantHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const { tenant } = testEnv();
  return {
    'Content-Type': 'application/json',
    'x-tenant-subdomain': tenant,
    ...extra,
  };
}

export function authHeaders(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return tenantHeaders({
    Authorization: `Bearer ${token}`,
    ...extra,
  });
}

export async function apiRequest<T = unknown>(
  method: string,
  path: string,
  options: {
    token?: string;
    body?: unknown;
    tenant?: string;
  } = {},
): Promise<ApiResponse<T>> {
  const { apiUrl, tenant } = testEnv();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-tenant-subdomain': options.tenant ?? tenant,
  };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const res = await fetch(`${apiUrl}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let body: T;
  try {
    body = text ? (JSON.parse(text) as T) : (null as T);
  } catch {
    body = text as T;
  }

  return { status: res.status, body, headers: res.headers };
}

export async function apiGet<T>(path: string, token?: string) {
  return apiRequest<T>('GET', path, { token });
}

export async function apiPost<T>(path: string, body: unknown, token?: string) {
  return apiRequest<T>('POST', path, { token, body });
}

export async function apiPatch<T>(path: string, body: unknown, token?: string) {
  return apiRequest<T>('PATCH', path, { token, body });
}

export async function apiDelete<T>(path: string, token?: string) {
  return apiRequest<T>('DELETE', path, { token });
}

export function isLiveApiEnabled(): boolean {
  return testEnv().liveApi;
}

export function skipUnlessLiveApi(): void {
  if (!isLiveApiEnabled()) {
    throw new Error('SKIP: FALCON_LIVE_API=1 required');
  }
}

export { TEST_PASSWORD };
