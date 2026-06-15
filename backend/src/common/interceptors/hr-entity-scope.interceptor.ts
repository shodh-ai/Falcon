import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { EntityScopeContext } from '../entity-scope/entity-scope.context';
import { SKIP_ENTITY_SCOPE_KEY } from '../decorators/skip-entity-scope.decorator';
import { HrEntityContextService } from '../../modules/hr/hr-entity-context.service';

export const HR_ENTITY_ID_KEY = 'hrEntityId';

type ScopedRequest = {
  user?: { user_id?: string; tenant_id?: string; roles?: string[]; role?: string };
  query?: Record<string, string | undefined>;
  headers?: Record<string, string | undefined>;
  route?: { path?: string };
  url?: string;
  [HR_ENTITY_ID_KEY]?: number;
};

const ENTITY_SCOPED_PREFIXES = ['/api/hr', '/hr'];
const ENTITY_SCOPE_SKIP_SUFFIXES = ['/entities', '/admin/permissions'];

@Injectable()
export class HrEntityScopeInterceptor implements NestInterceptor {
  constructor(
    private readonly entityCtx: HrEntityContextService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ENTITY_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    const req = context.switchToHttp().getRequest<ScopedRequest>();
    const path = (req as { originalUrl?: string }).originalUrl?.split('?')[0]
      ?? req.url?.split('?')[0]
      ?? '';

    if (!this.isEntityScopedPath(path) || !req.user?.user_id) {
      return next.handle();
    }

    const tenantId = req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
    const roles = req.user.roles?.length
      ? req.user.roles
      : req.user.role
        ? [req.user.role]
        : [];

    const raw = req.headers?.['x-entity-id'] ?? req.query?.entity_id;
    const entityId = await this.entityCtx.resolveRequestEntityId(
      tenantId,
      req.user.user_id,
      roles,
      raw,
    );

    req[HR_ENTITY_ID_KEY] = entityId;

    return new Observable((subscriber) => {
      EntityScopeContext.run(
        { entityId, tenantId, userId: req.user!.user_id! },
        () => {
          next.handle().subscribe({
            next: (value) => subscriber.next(value),
            error: (err) => subscriber.error(err),
            complete: () => subscriber.complete(),
          });
        },
      );
    });
  }

  private isEntityScopedPath(path: string): boolean {
    if (!ENTITY_SCOPED_PREFIXES.some((prefix) => path.startsWith(prefix))) return false;
    return !ENTITY_SCOPE_SKIP_SUFFIXES.some((suffix) => path.endsWith(suffix));
  }
}
