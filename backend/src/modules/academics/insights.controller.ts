import { Controller, Get, Req } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { InsightsService } from './insights.service';

@Controller('api/academics/insights')
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  private tenant(req: any) {
    return req.user?.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  @Get('academic-performance')
  @Roles('Dean', 'Vice Chancellor', 'Leadership', 'President', 'SuperAdmin')
  getAcademicPerformance(@Req() req: any) {
    return this.insightsService.getAcademicPerformance(this.tenant(req));
  }
}
