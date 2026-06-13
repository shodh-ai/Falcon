import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

type AuthUser = { user_id: string; tenant_id?: string };

@Injectable()
export class OwnerAccessGuard implements CanActivate {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = req.user;
    if (!user?.user_id) return false;

    const tenantId = user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
    const rows = await this.db.query(
      `SELECT 1
       FROM owner_access_control
       WHERE tenant_id = $1 AND user_id = $2 AND is_active = TRUE
       LIMIT 1`,
      [tenantId, user.user_id],
    );
    return rows.length > 0;
  }
}
