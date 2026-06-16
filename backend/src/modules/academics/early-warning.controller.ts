import { Controller, Get, Post, Param, Req, UseGuards } from '@nestjs/common';
import { EarlyWarningService } from './early-warning.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('api/academics/early-warning')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EarlyWarningController {
  constructor(private readonly warningService: EarlyWarningService) {}

  @Get('dashboard')
  @Roles('Faculty', 'SuperAdmin')
  getDashboard(@Req() req: any) {
    const ctx = {
      userId: req.user.user_id,
      tenantId: req.user.tenant_id,
      roles: req.user.roles || [],
    };
    return this.warningService.getFacultyAtRiskStudents(ctx);
  }

  @Post(':studentId/intervention')
  @Roles('Faculty', 'SuperAdmin')
  scheduleIntervention(@Req() req: any, @Param('studentId') studentId: string) {
    return this.warningService.scheduleIntervention(req.user.user_id, studentId);
  }
}
