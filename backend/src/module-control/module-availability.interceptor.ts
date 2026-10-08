import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, from, mergeMap } from 'rxjs';
import { resolveApiModule, type BusinessModuleKey } from './module-catalog';
import {
  MODULE_HISTORY_READ_KEY,
  MODULE_OWNER_KEY,
} from './module-control.decorators';
import { ModuleControlService } from './module-control.service';

@Injectable()
export class ModuleAvailabilityInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly modules: ModuleControlService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<any>();
    const explicit = this.reflector.getAllAndOverride<string>(
      MODULE_OWNER_KEY,
      [context.getHandler(), context.getClass()],
    );
    const owner =
      explicit ??
      resolveApiModule(String(req.path ?? req.url ?? '').split('?')[0]);
    if (!owner || owner === 'CORE' || !req.user?.tenant_id)
      return next.handle();

    return from(
      this.modules.effectiveState(owner as BusinessModuleKey, {
        tenantId: req.user.tenant_id,
        userId: req.user.user_id,
        campusIds: req.user.campus_ids,
        departmentId: req.user.dept_id ?? req.user.department_id,
      }),
    ).pipe(
      mergeMap((effective) => {
        const write = !['GET', 'HEAD', 'OPTIONS'].includes(
          String(req.method).toUpperCase(),
        );
        const historyRead = this.reflector.getAllAndOverride<boolean>(
          MODULE_HISTORY_READ_KEY,
          [context.getHandler(), context.getClass()],
        );
        const roles = [
          ...(req.user.roles ?? []),
          ...(req.user.role ? [req.user.role] : []),
        ];
        const privilegedRead =
          !write &&
          roles.some((role: string) =>
            ['SuperAdmin', 'TenantAdmin', 'InternalAuditor'].includes(role),
          );
        if (effective.available) return next.handle();
        if (
          (effective.state === 'DRAINING' || effective.state === 'PAUSED') &&
          write
        ) {
          throw new ConflictException({
            code: 'MODULE_PAUSED',
            module_key: owner,
            state: effective.state,
            revision: effective.revision,
          });
        }
        if (!write && (historyRead || privilegedRead)) return next.handle();
        throw new ForbiddenException({
          code: 'MODULE_NOT_AVAILABLE',
          module_key: owner,
          state: effective.state,
          revision: effective.revision,
        });
      }),
    );
  }
}
