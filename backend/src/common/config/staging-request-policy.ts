/** The only anonymous staging surface: health, login/reset and dummy branding. */
export function anonymousStagingRequest(method: string, path: string): boolean {
  if (method === 'OPTIONS') return true;
  const normalized = path.replace(/\/+$/, '') || '/';
  if (method === 'GET') {
    return normalized === '/health' || /^\/api\/tenants\/resolve\/[a-z0-9-]{1,63}$/.test(normalized);
  }
  return method === 'POST' && /^\/(?:api\/)?auth\/(?:local-login|forgot-password|reset-password)$/.test(normalized);
}
