import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

/** Persists ?tenant=sgvu across the Google OAuth redirect round-trip. */
@Injectable()
export class AuthTenantCookieMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const tenant =
      typeof req.query.tenant === 'string' ? req.query.tenant : null;
    if (tenant && req.path.endsWith('/auth/google')) {
      res.cookie('tenant_subdomain', tenant.toLowerCase(), {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 5 * 60 * 1000,
      });
    }
    next();
  }
}
