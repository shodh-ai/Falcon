import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../entities/audit-log.entity';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>,
  ) {}

  log(params: {
    userId: string;
    action: string;
    entityType?: string;
    entityId?: string;
    details?: Record<string, unknown>;
  }) {
    return this.logs.save(
      this.logs.create({
        user_id: params.userId,
        action: params.action,
        entity_type: params.entityType ?? undefined,
        entity_id: params.entityId ?? undefined,
        details: params.details ?? undefined,
      } as AuditLog),
    );
  }

  listRecent(limit = 50) {
    return this.logs.find({ order: { created_at: 'DESC' }, take: limit });
  }
}
