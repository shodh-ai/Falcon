import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { HrEntityContextService } from '../../modules/hr/hr-entity-context.service';

export const HR_ENTITY_ID_KEY = 'hrEntityId';

type ScopedRequest = {
  user?: { user_id?: string; tenant_id?: string; roles?: string[]; role?: string };
  query?: Record<string, string | undefined>;
  headers?: Record<string, string | undefined>;
  [HR_ENTITY_ID_KEY]?: number;
};

@Injectable()
export class HrEntityScopeInterceptor implements NestInterceptor {
  constructor(private readonly entityCtx: HrEntityContextService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<ScopedRequest>();
    const raw = req.query?.entity_id ?? req.headers?.['x-entity-id'];
    const tenantId = req.user?.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';

    if (raw != null && raw !== '' && req.user?.user_id) {
      const entityId = await this.entityCtx.resolveEntityId(tenantId, raw);
      const roles = req.user.roles?.length
        ? req.user.roles
        : req.user.role
          ? [req.user.role]
          : [];
      await this.entityCtx.assertEntityAccess(tenantId, req.user.user_id, roles, entityId);
      req[HR_ENTITY_ID_KEY] = entityId;
    }

    return next.handle();
  }
}
