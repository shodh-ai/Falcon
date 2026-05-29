import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemAlert } from '../entities/system-alert.entity';

@Injectable()
export class SystemAlertsService {
  constructor(
    @InjectRepository(SystemAlert)
    private readonly alerts: Repository<SystemAlert>,
  ) {}

  listUnreadForUser(userId: string, tenantId: string) {
    return this.alerts.find({
      where: {
        user_id: userId,
        tenant_id: tenantId,
        is_read: false,
      },
      order: { created_at: 'DESC' },
    });
  }
}
