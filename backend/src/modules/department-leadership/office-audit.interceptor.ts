import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OfficeContext } from './leadership.types';
@Injectable()
export class OfficeAuditInterceptor implements NestInterceptor {
  constructor(private readonly db: DataSource) {}
  async intercept(context: ExecutionContext, next: CallHandler) {
    const req = context
      .switchToHttp()
      .getRequest<{
        method: string;
        path: string;
        user?: {
          user_id: string;
          tenant_id: string;
          office_context?: OfficeContext;
          impersonator_user_id?:string;
        };
      }>();
    const office = req.user?.office_context;
    if (office && req.user) {
      // Audit the attempted action before execution. Never store request bodies/documents.
      await this.db.query(
        `INSERT INTO department_leadership_events(tenant_id,dept_id,actor_user_id,action,details)
        VALUES($1,$2,$3,'OFFICE_REQUEST',$4)`,
        [
          req.user.tenant_id,
          office.dept_id,
          req.user.impersonator_user_id ?? req.user.user_id,
          JSON.stringify({ office, subject_user_id:req.user.user_id, impersonator_user_id:req.user.impersonator_user_id, method: req.method, path: req.path }),
        ],
      );
    }
    return next.handle();
  }
}
