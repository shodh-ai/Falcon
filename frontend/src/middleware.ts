import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  extractSubdomainFromHost,
  resolveTenantSubdomain,
} from '@/lib/resolve-tenant-subdomain';

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

function extractSubdomain(host: string): string {
  const fromHost = extractSubdomainFromHost(host);
  return resolveTenantSubdomain(fromHost);
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
    (prefix) => prefix !== '/' && (pathname === prefix || pathname.startsWith(`${prefix}/`)),
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

export function middleware(request: NextRequest) {
  const subdomain = extractSubdomain(request.headers.get('host') ?? '');
  const { pathname } = request.nextUrl;

  if (isProtectedPortalPath(pathname)) {
    const token = request.cookies.get(AUTH_COOKIE)?.value;
    if (!token) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/';
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  const response = NextResponse.next();

  response.cookies.set(TENANT_COOKIE, subdomain, {
    path: '/',
    sameSite: 'lax',
  });
  response.headers.set('x-tenant-subdomain', subdomain);

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|favicon.*\\.png|apple-touch-icon\\.png).*)'],
};
