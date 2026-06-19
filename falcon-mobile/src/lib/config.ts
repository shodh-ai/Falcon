export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';
export const DEFAULT_TENANT_SUBDOMAIN =
  process.env.EXPO_PUBLIC_DEFAULT_TENANT_SUBDOMAIN ?? 'sgvu';

export const STORAGE_KEYS = {
  token: 'falcon_auth_token',
  user: 'falcon_auth_user',
} as const;
