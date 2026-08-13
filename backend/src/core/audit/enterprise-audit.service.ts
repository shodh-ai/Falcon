import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export type EnterpriseAuditContext = {
  tenantId: string;
  userId: string;
  role?: string;
  module: string;
  action: string;
  recordId?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ip?: string;
  sessionId?: string;
};

@Injectable()
export class EnterpriseAuditService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async log(ctx: EnterpriseAuditContext) {
    const meta = {
      tenant_id: ctx.tenantId,
      role: ctx.role ?? null,
      module: ctx.module,
      action: ctx.action,
      ip: ctx.ip ?? null,
      session_id: ctx.sessionId ?? null,
      timestamp: new Date().toISOString(),
    };

    await this.db.query(
      `INSERT INTO system_audit_logs (table_name, record_id, action, old_value, new_value, changed_by_user_id)
       VALUES ($1, $2, 'UPDATE', $3, $4, $5)`,
      [
        ctx.module,
        ctx.recordId ?? null,
        JSON.stringify({ ...(ctx.oldValue ?? {}), _meta: meta }),
        JSON.stringify({ ...(ctx.newValue ?? {}), _meta: meta }),
        ctx.userId,
      ],
    );

    await this.db
      .query(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW())`,
        [
          ctx.userId,
          ctx.action,
          ctx.module,
          ctx.recordId ?? null,
          JSON.stringify({
            ...meta,
            old_value: ctx.oldValue ?? null,
            new_value: ctx.newValue ?? null,
          }),
        ],
      )
      .catch(() => undefined);
  }

  async listForTenant(
    tenantId: string,
    options?: { module?: string; limit?: number; offset?: number },
  ) {
    const limit = Math.min(options?.limit ?? 50, 200);
    const offset = options?.offset ?? 0;
    const params: unknown[] = [tenantId];
    let moduleFilter = '';
    if (options?.module) {
      params.push(options.module);
      moduleFilter = ` AND al.table_name = $${params.length}`;
    }
    params.push(limit, offset);
    const limitParam = params.length - 1;
    const offsetParam = params.length;

    const rows = await this.db.query(
      `SELECT al.log_id, al.table_name AS module, al.record_id, al.action,
              al.old_value, al.new_value, al.changed_by_user_id, al.changed_at,
              u.name AS actor_name, r.role_name AS actor_role
       FROM system_audit_logs al
       LEFT JOIN users u ON u.user_id = al.changed_by_user_id
       LEFT JOIN roles r ON r.role_id = u.role_id
       WHERE (al.old_value->'_meta'->>'tenant_id' = $1
              OR al.new_value->'_meta'->>'tenant_id' = $1
              OR u.tenant_id = $1::uuid)
       ${moduleFilter}
       ORDER BY al.changed_at DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params,
    );

    return rows;
  }
}
