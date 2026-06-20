import {
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  SoftRemoveEvent,
  UpdateEvent,
} from 'typeorm';
import { Logger } from '@nestjs/common';
import type { AuditAction } from '../../entities/system-audit-log.entity';

const SKIP_TABLES = new Set(['system_audit_logs', 'leadership_feed_events']);

@EventSubscriber()
export class SystemAuditSubscriber implements EntitySubscriberInterface {
  private readonly logger = new Logger(SystemAuditSubscriber.name);

  afterInsert(event: InsertEvent<object>) {
    void this.logChange(
      event,
      'INSERT',
      null,
      event.entity as Record<string, unknown>,
    );
  }

  afterUpdate(event: UpdateEvent<object>) {
    void this.logChange(
      event,
      'UPDATE',
      (event.databaseEntity as Record<string, unknown>) ?? null,
      (event.entity as Record<string, unknown>) ?? null,
    );
  }

  afterSoftRemove(event: SoftRemoveEvent<object>) {
    void this.logChange(
      event,
      'SOFT_DELETE',
      (event.databaseEntity as Record<string, unknown>) ?? null,
      null,
    );
  }

  private async logChange(
    event: InsertEvent<object> | UpdateEvent<object> | SoftRemoveEvent<object>,
    action: AuditAction,
    oldValue: Record<string, unknown> | null,
    newValue: Record<string, unknown> | null,
  ) {
    const tableName = event.metadata.tableName;
    if (SKIP_TABLES.has(tableName)) return;

    const recordId = this.extractRecordId(
      event.metadata.primaryColumns,
      newValue ?? oldValue,
    );
    const changedBy = this.extractUserId(newValue ?? oldValue);

    try {
      await event.manager.query(
        `INSERT INTO system_audit_logs (table_name, record_id, action, old_value, new_value, changed_by_user_id)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)`,
        [
          tableName,
          recordId,
          action,
          oldValue ? JSON.stringify(oldValue) : null,
          newValue ? JSON.stringify(newValue) : null,
          changedBy,
        ],
      );
    } catch (err) {
      this.logger.warn(
        `Audit log failed for ${tableName}: ${(err as Error).message}`,
      );
    }
  }

  private extractRecordId(
    primaryColumns: { propertyName: string }[],
    entity: Record<string, unknown> | null,
  ): string | null {
    if (!entity || primaryColumns.length === 0) return null;
    const key = primaryColumns[0].propertyName;
    const val = entity[key];
    return val != null ? String(val) : null;
  }

  private extractUserId(entity: Record<string, unknown> | null): string | null {
    if (!entity) return null;
    for (const key of ['changed_by_user_id', 'updated_by_user_id', 'user_id']) {
      if (entity[key]) return String(entity[key]);
    }
    return null;
  }
}
