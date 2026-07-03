import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  extractSubdomainFromHost,
  resolveTenantSubdomain,
} from '@/lib/resolve-tenant-subdomain';

const TENANT_COOKIE = 'falcon_tenant_subdomain';

function extractSubdomain(host: string): string {
  const fromHost = extractSubdomainFromHost(host);
  return resolveTenantSubdomain(fromHost);
}

export function middleware(request: NextRequest) {
  const subdomain = extractSubdomain(request.headers.get('host') ?? '');
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
