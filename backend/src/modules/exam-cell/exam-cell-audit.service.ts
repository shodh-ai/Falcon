import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class ExamCellAuditService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async log(
    tenantId: string,
    actorUserId: string | undefined,
    payload: {
      action: string;
      resource_type: string;
      resource_id?: string;
      old_value?: unknown;
      new_value?: unknown;
      ip_address?: string;
    },
  ) {
    try {
      await this.db.query(
        `INSERT INTO exam_audit_logs
           (tenant_id, actor_user_id, action, resource_type, resource_id, old_value, new_value, ip_address)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          tenantId,
          actorUserId ?? null,
          payload.action,
          payload.resource_type,
          payload.resource_id ?? null,
          payload.old_value ? JSON.stringify(payload.old_value) : null,
          payload.new_value ? JSON.stringify(payload.new_value) : null,
          payload.ip_address ?? null,
        ],
      );
    } catch {
      /* audit must not break primary flows */
    }
  }

  async listRecent(tenantId: string, limit = 15) {
    return this.list(tenantId, { limit });
  }

  async hasAction(
    tenantId: string,
    resourceId: string,
    action: string,
  ): Promise<boolean> {
    try {
      const rows = await this.db.query(
        `SELECT 1 FROM exam_audit_logs
         WHERE tenant_id = $1 AND resource_id = $2 AND action = $3
         LIMIT 1`,
        [tenantId, resourceId, action],
      );
      return rows.length > 0;
    } catch {
      return false;
    }
  }

  async latestAction(
    tenantId: string,
    resourceId: string,
    actions: string[],
  ): Promise<string | null> {
    if (!actions.length) return null;
    try {
      const rows = await this.db.query<Array<{ action: string }>>(
        `SELECT action FROM exam_audit_logs
         WHERE tenant_id = $1 AND resource_id = $2 AND action = ANY($3::text[])
         ORDER BY created_at DESC LIMIT 1`,
        [tenantId, resourceId, actions],
      );
      return rows[0]?.action ?? null;
    } catch {
      return null;
    }
  }

  async list(
    tenantId: string,
    opts: { limit?: number; action?: string; resource_type?: string } = {},
  ) {
    const limit = opts.limit ?? 50;
    const params: unknown[] = [tenantId];
    let sql = `
      SELECT a.audit_id, a.action, a.resource_type, a.resource_id,
             a.old_value, a.new_value, a.ip_address, a.created_at,
             u.name AS actor_name
      FROM exam_audit_logs a
      LEFT JOIN users u ON u.user_id = a.actor_user_id
      WHERE a.tenant_id = $1`;
    if (opts.action) {
      params.push(`%${opts.action}%`);
      sql += ` AND a.action ILIKE $${params.length}`;
    }
    if (opts.resource_type) {
      params.push(opts.resource_type);
      sql += ` AND a.resource_type = $${params.length}`;
    }
    params.push(limit);
    sql += ` ORDER BY a.created_at DESC LIMIT $${params.length}`;
    try {
      return await this.db.query(sql, params);
    } catch {
      return [];
    }
  }
}
