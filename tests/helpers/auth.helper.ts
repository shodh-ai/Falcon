import { testEnv } from './env';
import { TEST_PASSWORD, TEST_USERS } from './test-users';

export type LoginResult = {
  token: string;
  user: {
    user_id: string;
    email: string;
    role: string;
    roles?: string[];
    primaryRole?: string;
  };
};

export { TEST_USERS, TEST_PASSWORD };

export async function loginWithEmail(
  email: string,
  password = TEST_PASSWORD,
): Promise<LoginResult> {
  const { apiUrl, tenant } = testEnv();
  const res = await fetch(`${apiUrl}/api/auth/local-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-subdomain': tenant,
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Login failed for ${email}: ${res.status} ${text}`);
  }
  return res.json() as Promise<LoginResult>;
}

export function authHeaders(token: string): Record<string, string> {
  const { tenant } = testEnv();
  return {
    Authorization: `Bearer ${token}`,
    'x-tenant-subdomain': tenant,
  };
}

export async function apiGet<T>(
  path: string,
  token: string,
): Promise<{ status: number; body: T }> {
  const { apiUrl } = testEnv();
  const res = await fetch(`${apiUrl}${path}`, { headers: authHeaders(token) });
  const text = await res.text();
  let body: T;
  try {
    body = text ? (JSON.parse(text) as T) : (null as T);
  } catch {
    body = text as T;
  }
  return { status: res.status, body };
}
