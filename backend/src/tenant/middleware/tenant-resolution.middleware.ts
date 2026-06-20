import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { TenantService } from '../tenant.service';
import { TenantContextService } from '../tenant-context.service';

@Injectable()
export class TenantResolutionMiddleware implements NestMiddleware {
  constructor(
    private readonly tenantService: TenantService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const subdomain = this.extractSubdomain(req);
    if (!subdomain) {
      return next();
    }

    try {
      const tenant = await this.tenantService.findBySubdomain(subdomain);
      const features = await this.tenantService.getEnabledFeatures(
        tenant.tenant_id,
      );
      req.headers['x-tenant-id'] = tenant.tenant_id;
      req.headers['x-tenant-subdomain'] = tenant.subdomain;

      this.tenantContext.run(
        {
          tenant,
          pgSchema: tenant.pg_schema,
          features,
        },
        () => next(),
      );
    } catch {
      next();
    }
  }

  private extractSubdomain(req: Request): string | null {
    const header = req.headers['x-tenant-subdomain'];
    if (typeof header === 'string' && header.length > 0) {
      return header.toLowerCase();
    }

    const host = req.headers.host?.split(':')[0] ?? '';
    const baseDomain = process.env.SAAS_BASE_DOMAIN ?? 'localhost';
    if (host.endsWith(`.${baseDomain}`)) {
      const sub = host.slice(0, -(baseDomain.length + 1));
      if (sub && !sub.includes('.')) return sub.toLowerCase();
    }

    return null;
  }
}

/** Resolves tenant from JWT payload after auth (used in JwtStrategy). */
export async function buildTenantContext(
  tenantService: TenantService,
  tenantId: string,
) {
  const tenant = await tenantService.findById(tenantId);
  const features = await tenantService.getEnabledFeatures(tenant.tenant_id);
  return {
    tenant,
    pgSchema: tenant.pg_schema,
    features,
  };
}
