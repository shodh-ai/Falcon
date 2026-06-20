import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, from, mergeMap } from 'rxjs';
import { TenantContextService } from '../tenant-context.service';
import { TenantService } from '../tenant.service';
import { buildTenantContext } from '../middleware/tenant-resolution.middleware';

/**
 * After JWT auth, binds tenant + feature flags into AsyncLocalStorage for the request.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(
    private readonly tenantService: TenantService,
    private readonly tenantContext: TenantContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context
      .switchToHttp()
      .getRequest<{ user?: { tenant_id?: string } }>();
    const tenantId = req.user?.tenant_id;

    if (!tenantId) {
      return next.handle();
    }

    return from(buildTenantContext(this.tenantService, tenantId)).pipe(
      mergeMap((store) => {
        return new Observable((subscriber) => {
          this.tenantContext.run(store, () => {
            next.handle().subscribe(subscriber);
          });
        });
      }),
    );
  }
}
