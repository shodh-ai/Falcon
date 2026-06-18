import axios, { AxiosError } from 'axios';
import { API_URL, DEFAULT_TENANT_SUBDOMAIN } from './config';
import { clearSession, getStoredToken } from './auth-storage';
import { emitUnauthorized } from './auth-events';
import type { DeviceTokenPayload, LoginResponse } from '@/types/auth';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'x-tenant-subdomain': DEFAULT_TENANT_SUBDOMAIN,
  },
});

api.interceptors.request.use(async (config) => {
  const token = await getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers['x-tenant-subdomain'] = DEFAULT_TENANT_SUBDOMAIN;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      await clearSession();
      emitUnauthorized();
    }
    return Promise.reject(error);
  },
);

export async function localLogin(email: string, password: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/api/auth/local-login', {
    email,
    password,
  });
  return data;
}

export async function registerDeviceToken(deviceToken: string): Promise<void> {
  const payload: DeviceTokenPayload = { device_token: deviceToken };
  await api.patch('/api/users/me/device-token', payload);
}

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(data?.message)) return data.message.join(', ');
    if (typeof data?.message === 'string') return data.message;
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

export function profilePhotoUri(path?: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  return `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
