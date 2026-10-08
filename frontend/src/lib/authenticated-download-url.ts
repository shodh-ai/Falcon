/**
 * Append the session JWT as access_token so <a>/<img> downloads work
 * against protected /api/uploads/download endpoints.
 */
export function withAccessToken(url: string, token?: string | null): string {
  if (!url || !token) return url;
  if (url.startsWith('http') && !url.includes('/api/uploads/') && !url.includes('/uploads/download')) {
    return url;
  }
  try {
    const base =
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const parsed = new URL(url, base);
    if (!parsed.pathname.includes('/uploads/download') && !parsed.pathname.includes('/api/uploads/download')) {
      return url;
    }
    parsed.searchParams.set('access_token', token);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    const join = url.includes('?') ? '&' : '?';
    return `${url}${join}access_token=${encodeURIComponent(token)}`;
  }
}
