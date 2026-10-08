import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export type DeanAuditContext = {
  tenantId: string;
  userId: string;
  role: string;
  module: string;
  action: string;
  recordId?: string;
  schoolId?: number;
  deptId?: number;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
};

@Injectable()
export class DeanAuditService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async logAction(ctx: DeanAuditContext) {
    const meta = {
      role: ctx.role,
      action: ctx.action,
      school_id: ctx.schoolId ?? null,
      dept_id: ctx.deptId ?? null,
      ip: ctx.ip ?? null,
      user_agent: ctx.userAgent ?? null,
      tenant_id: ctx.tenantId,
    };

    await this.db.query(
      `INSERT INTO system_audit_logs (table_name, record_id, action, old_value, new_value, changed_by_user_id)
       VALUES ($1, $2, 'UPDATE', $3, $4, $5)`,
      [
        ctx.module,
        ctx.recordId ?? null,
        JSON.stringify({ ...(ctx.previousValue ?? {}), meta }),
        JSON.stringify({ ...(ctx.newValue ?? {}), meta }),
        ctx.userId,
      ],
    );
  }
}
