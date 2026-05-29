import { Injectable } from '@nestjs/common';
import { TenantContextService } from './tenant-context.service';

/**
 * Reads tenant-specific business rules from settings JSONB.
 * Never hardcode thresholds — always use this service.
 */
@Injectable()
export class TenantSettingsService {
  constructor(private readonly tenantContext: TenantContextService) {}

  getNumber(key: string, fallback: number): number {
    const settings = this.tenantContext.getSettings();
    const value = settings[key];
    return typeof value === 'number' ? value : fallback;
  }

  getMinAttendancePercent(): number {
    return this.getNumber('min_attendance_percent', 75);
  }

  getString(key: string, fallback: string): string {
    const settings = this.tenantContext.getSettings();
    const value = settings[key];
    return typeof value === 'string' ? value : fallback;
  }
}
