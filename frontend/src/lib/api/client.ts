export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiRequest {
  url: string;
  method?: HttpMethod;
  headers: Record<string, string>;
  data?: unknown;
}

export const authHeaders = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
});

export const jsonHeaders = (token: string): Record<string, string> => ({
  ...authHeaders(token),
  'Content-Type': 'application/json',
});

/**
 * Tiny fetch wrapper that injects the bearer token + content-type and
 * unwraps JSON. Keep callers thin: per-domain modules in this folder
 * should only describe *which* endpoint + payload to hit, not how to hit
 * it.
 */
export async function apiFetch<T>(token: string | null, req: ApiRequest): Promise<T> {
  const init: RequestInit = {
    method: req.method ?? 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(req.data && !(req.data instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...req.headers,
    },
    body: req.data
      ? req.data instanceof FormData
        ? req.data
        : JSON.stringify(req.data)
      : undefined,
  };
  const res = await fetch(req.url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status} ${res.statusText}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
