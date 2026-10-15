import {
  CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Observable, from, mergeMap } from 'rxjs';

/** A re-opened, already-onboarded staff identity may authenticate, but may not
 * use any business API until HR Admin makes a fresh decision. */
@Injectable()
export class StaffProfileFreezeInterceptor implements NestInterceptor {
  constructor(private readonly db: DataSource) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      user?: { user_id?: string; tenant_id?: string };
      originalUrl?: string; url?: string; method?: string;
    }>();
    const user = req.user;
    if (!user?.user_id || !user.tenant_id) return next.handle();
    const path = String(req.originalUrl ?? req.url ?? '').split('?')[0].replace(/\/$/, '');
    const method = String(req.method ?? '').toUpperCase();
    const accountAccess = /^\/(?:api\/)?auth\/(?:me|me\/permissions|profile|change-password|logout)$/.test(path);
    const reviewAccess = /^\/api\/staff\/profile-review\/me(?:\/corrections|\/resubmit|\/documents\/[A-Z_]+)?$/.test(path);
    const runtimeAccess = method === 'GET' && path === '/api/platform/modules/runtime';
    if (accountAccess || reviewAccess || runtimeAccess) return next.handle();

    return from(this.db.query(
      `SELECT 1 FROM staff_profile_reviews v
       JOIN users u ON u.user_id = v.user_id AND u.tenant_id = v.tenant_id
       WHERE v.tenant_id = $1 AND v.user_id = $2
         AND v.status IN ('PENDING_HR', 'RETURNED_FOR_CORRECTION')
         AND v.source = 'PHARMACY_RECHECK'
         AND u.onboarding_status = 'COMPLETED'
       LIMIT 1`,
      [user.tenant_id, user.user_id],
    )).pipe(mergeMap((rows: unknown[]) => {
      if (rows.length) {
        throw new ForbiddenException({
          code: 'HR_PROFILE_VERIFICATION_PENDING',
          message: 'This account is temporarily frozen while HR verifies the staff profile.',
        });
      }
      return next.handle();
    }));
  }
}
