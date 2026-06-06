import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HrEntityContextService } from '../../modules/hr/hr-entity-context.service';
import { SKIP_ENTITY_SCOPE_KEY } from '../decorators/skip-entity-scope.decorator';
import { HR_ENTITY_ID_KEY } from '../interceptors/hr-entity-scope.interceptor';

type EntityScopedRequest = {
  user?: { user_id?: string; tenant_id?: string; roles?: string[]; role?: string };
  query?: Record<string, string | undefined>;
  headers?: Record<string, string | undefined>;
  route?: { path?: string };
  url?: string;
  [HR_ENTITY_ID_KEY]?: number;
};

const ENTITY_SCOPED_PREFIXES = ['/api/hr', '/hr'];

const ENTITY_SCOPE_SKIP_SUFFIXES = [
  '/entities',
  '/admin/permissions',
  '/admin/permissions/',
];

@Injectable()
export class EntityScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entityCtx: HrEntityContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(SKIP_ENTITY_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ])) {
      return true;
    }

    const req = context.switchToHttp().getRequest<EntityScopedRequest>();
    const path = (req as { originalUrl?: string }).originalUrl?.split('?')[0]
      ?? req.url?.split('?')[0]
      ?? '';

    if (!this.isEntityScopedPath(path)) return true;
    if (!req.user?.user_id) return true;

    const tenantId = req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
    const roles = req.user.roles?.length
      ? req.user.roles
      : req.user.role
        ? [req.user.role]
        : [];

    if (req[HR_ENTITY_ID_KEY] != null) return true;

    const raw = req.headers?.['x-entity-id'] ?? req.query?.entity_id;
    const entityId = await this.entityCtx.resolveRequestEntityId(
      tenantId,
      req.user.user_id,
      roles,
      raw,
    );
    req[HR_ENTITY_ID_KEY] = entityId;
    return true;
  }

  private isEntityScopedPath(path: string): boolean {
    if (!ENTITY_SCOPED_PREFIXES.some((prefix) => path.startsWith(prefix))) return false;
    return !ENTITY_SCOPE_SKIP_SUFFIXES.some((suffix) => path.endsWith(suffix));
  }
}
