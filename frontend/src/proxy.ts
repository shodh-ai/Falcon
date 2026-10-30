import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { resolveTenantFromHost } from '@/lib/resolve-tenant-subdomain';

const TENANT_COOKIE = 'falcon_tenant_subdomain';
const AUTH_COOKIE = 'falcon_auth_token';

/** Paths that never require a session cookie. */
const PUBLIC_PREFIXES = [
  '/',
  '/auth',
  '/login',
  '/forgot-password',
  '/reset-password',
  '/verify',
  '/api',
];

function validTenantOverride(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(normalized)
    ? normalized
    : undefined;
}

function extractSubdomain(request: NextRequest): string {
  const requested = validTenantOverride(
    request.nextUrl.searchParams.get('tenant') ?? undefined,
  );
  const remembered = validTenantOverride(
    request.cookies.get(TENANT_COOKIE)?.value,
  );
  return resolveTenantFromHost(
    request.headers.get('host') ?? '',
    requested ?? remembered,
  );
}

function isPublicPath(pathname: string): boolean {
  if (pathname === '/') return true;
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/assets') ||
    pathname.startsWith('/public')
  ) {
    return true;
  }
  return PUBLIC_PREFIXES.some(
    (prefix) =>
      prefix !== '/' &&
      (pathname === prefix || pathname.startsWith(`${prefix}/`)),
  );
}

/** Portal / app areas that must have an auth cookie present. */
function isProtectedPortalPath(pathname: string): boolean {
  if (isPublicPath(pathname)) return false;
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/campus-admin') ||
    pathname.startsWith('/super-admin') ||
    pathname.startsWith('/student') ||
    pathname.startsWith('/faculty') ||
    pathname.startsWith('/hod') ||
    pathname.startsWith('/principal') ||
    pathname.startsWith('/dean') ||
    pathname.startsWith('/hr') ||
    pathname.startsWith('/finance') ||
    pathname.startsWith('/exam-cell') ||
    pathname.startsWith('/president') ||
    pathname.startsWith('/leadership') ||
    pathname.startsWith('/admissions-crm') ||
    pathname.startsWith('/placements') ||
    pathname.startsWith('/iqac') ||
    pathname.startsWith('/library') ||
    pathname.startsWith('/hostel') ||
    pathname.startsWith('/parent') ||
    pathname.startsWith('/alumni') ||
    pathname.startsWith('/documents') ||
    pathname.startsWith('/reports') ||
    pathname.startsWith('/directory') ||
    pathname.startsWith('/admin-ops') ||
    pathname.startsWith('/research') ||
    pathname.startsWith('/incubation') ||
    pathname.startsWith('/ess') ||
    pathname.startsWith('/tickets') ||
    pathname.startsWith('/clinic') ||
    pathname.startsWith('/disciplinary') ||
    pathname.startsWith('/ecell')
  );
}

function stagingHeaders(response: NextResponse): NextResponse {
  if (process.env.NEXT_PUBLIC_FALCON_ENVIRONMENT === 'staging') {
    response.headers.set('X-Falcon-Environment', 'staging');
    response.headers.set('X-Falcon-Release', process.env.FALCON_RELEASE_ID ?? '');
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    response.headers.set('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://staging-apifalcon.jataka.io",
      "font-src 'self' data:",
      "connect-src 'self' https://staging-apifalcon.jataka.io wss://staging-apifalcon.jataka.io",
      "frame-src 'self' blob: https://staging-apifalcon.jataka.io", "frame-ancestors 'none'", "form-action 'self'",
      "base-uri 'self'", "object-src 'none'",
    ].join('; '));
  }
  return response;
}

export function proxy(request: NextRequest) {
  const subdomain = extractSubdomain(request);
  const { pathname } = request.nextUrl;

  if (isProtectedPortalPath(pathname)) {
    const token = request.cookies.get(AUTH_COOKIE)?.value;
    if (!token) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/';
      loginUrl.searchParams.set('next', pathname);
      return stagingHeaders(NextResponse.redirect(loginUrl));
    }
  }

  const response = NextResponse.next();

  response.cookies.set(TENANT_COOKIE, subdomain, {
    path: '/',
    sameSite: 'lax',
  });
  response.headers.set('x-tenant-subdomain', subdomain);

  return stagingHeaders(response);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|favicon.*\\.png|apple-touch-icon\\.png).*)',
  ],
};
