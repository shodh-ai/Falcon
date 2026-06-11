import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { LeadershipService } from './leadership.service';

type AuthUser = { user_id: string; tenant_id?: string };

@Controller('api/leadership')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Chairman', 'President', 'SuperAdmin')
export class LeadershipController {
  constructor(private readonly leadership: LeadershipService) {}

  @Get('overview')
  overview(@Req() req: { user: AuthUser }) {
    return this.leadership.getOverview(req.user.tenant_id);
  }

  @Get('finance')
  finance(@Req() req: { user: AuthUser }) {
    return this.leadership.getFinance(req.user.tenant_id);
  }

  @Get('academics')
  academics(@Req() req: { user: AuthUser }) {
    return this.leadership.getAcademics(req.user.tenant_id);
  }

  @Get('placements')
  placements(@Req() req: { user: AuthUser }) {
    return this.leadership.getPlacements(req.user.tenant_id);
  }

  @Get('hr-ops')
  hrOps(@Req() req: { user: AuthUser }) {
    return this.leadership.getHrOps(req.user.tenant_id);
  }

  @Get('drilldown')
  drilldown(
    @Req() req: { user: AuthUser },
    @Query('level') level: string,
    @Query('parentKey') parentKey?: string,
  ) {
    return this.leadership.getDrilldown(req.user.tenant_id, level, parentKey);
  }

  @Post('flag-to-hod')
  flagToHod(
    @Req() req: { user: AuthUser },
    @Body() body: { node_key: string; label: string; message?: string },
  ) {
    return this.leadership.flagToHod(req.user.tenant_id, req.user.user_id, body);
  }

  @Post('refresh-views')
  refreshViews() {
    return this.leadership.refreshMaterializedViews();
  }

  @Get('issues')
  @Roles('Chairman', 'President', 'SuperAdmin', 'Registrar')
  issues(@Req() req: { user: AuthUser }) {
    return this.leadership.getIssuesDashboard(req.user.tenant_id);
  }

  @Post('issues/:ticketId/escalate')
  @Roles('Chairman', 'President', 'SuperAdmin', 'Registrar')
  escalate(@Req() req: { user: AuthUser }, @Param('ticketId') ticketId: string) {
    return this.leadership.escalateIssue(req.user.tenant_id, ticketId, req.user.user_id);
  }
}
