import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { InsightsService } from './insights.service';

type AuthUser = { user_id: string; tenant_id?: string };

@Controller('api/academics/insights')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  private tenant(req: { user: AuthUser }) {
    return req.user?.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  @Get('academic-performance')
  @Roles('Dean', 'Vice Chancellor', 'Leadership', 'President', 'SuperAdmin')
  getAcademicPerformance(@Req() req: { user: AuthUser }) {
    return this.insightsService.getAcademicPerformance(this.tenant(req));
  }
}
