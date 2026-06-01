import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SystemAlertsService } from './system-alerts.service';

type AuthUser = {
  user_id: string;
  tenant_id?: string;
};

@Controller('api/system/alerts')
@UseGuards(JwtAuthGuard)
export class SystemAlertsController {
  constructor(private readonly alerts: SystemAlertsService) {}

  @Get('my-alerts')
  myAlerts(@Req() req: { user: AuthUser }) {
    return this.alerts.listUnreadForUser(
      req.user.user_id,
      req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001',
    );
  }
}
