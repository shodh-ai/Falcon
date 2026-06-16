import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const TENANT_COOKIE = 'falcon_tenant_subdomain';

function extractSubdomain(host: string): string | null {
  const hostname = host.split(':')[0];
  const baseDomain = process.env.SAAS_BASE_DOMAIN ?? 'localhost';

  if (baseDomain === 'localhost') {
    if (hostname.endsWith('.localhost')) {
      const sub = hostname.replace('.localhost', '');
      return sub && !sub.includes('.') ? sub : null;
    }
    return process.env.DEFAULT_TENANT_SUBDOMAIN ?? 'sgvu';
  }

  if (hostname.endsWith(`.${baseDomain}`)) {
    const sub = hostname.slice(0, -(baseDomain.length + 1));
    return sub && !sub.includes('.') ? sub : null;
  }

  return process.env.DEFAULT_TENANT_SUBDOMAIN ?? 'sgvu';
}

export function middleware(request: NextRequest) {
  const subdomain = extractSubdomain(request.headers.get('host') ?? '');
  const response = NextResponse.next();

  if (subdomain) {
    response.cookies.set(TENANT_COOKIE, subdomain, {
      path: '/',
      sameSite: 'lax',
    });
    response.headers.set('x-tenant-subdomain', subdomain);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|favicon.*\\.png|apple-touch-icon\\.png).*)'],
};
