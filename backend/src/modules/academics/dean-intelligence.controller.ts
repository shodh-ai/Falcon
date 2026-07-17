import {
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Body,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  DeanFilterQuery,
  DeanIntelligenceService,
} from './dean-intelligence.service';
import type { ListQueryParams } from '../../common/utils/pagination';

type AuthUser = { user_id: string; tenant_id?: string; role?: string };

@Controller('api/academics/dean/intelligence')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeanIntelligenceController {
  constructor(private readonly intelligence: DeanIntelligenceService) {}

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  @Get('dashboard')
  @Roles('Dean', 'SuperAdmin')
  dashboard(@Req() req: { user: AuthUser }, @Query() query: DeanFilterQuery) {
    return this.intelligence.getDashboardIntelligence(
      this.tenant(req),
      req.user.user_id,
      query,
    );
  }

  @Get('faculty-leaderboard')
  @Roles('Dean', 'SuperAdmin')
  facultyLeaderboard(
    @Req() req: { user: AuthUser },
    @Query() query: DeanFilterQuery,
  ) {
    return this.intelligence.getFacultyLeaderboard(
      this.tenant(req),
      req.user.user_id,
      query,
    );
  }

  @Get('analytics')
  @Roles('Dean', 'SuperAdmin')
  analytics(@Req() req: { user: AuthUser }, @Query() query: DeanFilterQuery) {
    return this.intelligence.getSchoolAnalytics(
      this.tenant(req),
      req.user.user_id,
      query,
    );
  }

  @Get('budget')
  @Roles('Dean', 'SuperAdmin')
  budget(@Req() req: { user: AuthUser }, @Query() query: DeanFilterQuery) {
    return this.intelligence.getBudgetMonitoring(
      this.tenant(req),
      req.user.user_id,
      query,
    );
  }

  @Get('research')
  @Roles('Dean', 'SuperAdmin')
  research(@Req() req: { user: AuthUser }, @Query() query: DeanFilterQuery) {
    return this.intelligence.getResearchDashboard(
      this.tenant(req),
      req.user.user_id,
      query,
    );
  }

  @Get('placement')
  @Roles('Dean', 'SuperAdmin')
  placement(@Req() req: { user: AuthUser }, @Query() query: DeanFilterQuery) {
    return this.intelligence.getPlacementDashboard(
      this.tenant(req),
      req.user.user_id,
      query,
    );
  }

  @Get('meetings')
  @Roles('Dean', 'SuperAdmin')
  meetings(@Req() req: { user: AuthUser }, @Query() query: DeanFilterQuery) {
    return this.intelligence.getMeetingAnalytics(
      this.tenant(req),
      req.user.user_id,
      query,
    );
  }

  @Get('search')
  @Roles('Dean', 'SuperAdmin')
  search(@Req() req: { user: AuthUser }, @Query('q') q?: string) {
    return this.intelligence.globalSearch(
      this.tenant(req),
      req.user.user_id,
      q ?? '',
    );
  }

  @Get('notifications')
  @Roles('Dean', 'SuperAdmin')
  notifications(
    @Req() req: { user: AuthUser },
    @Query() query: ListQueryParams,
  ) {
    return this.intelligence.getDeanNotifications(
      this.tenant(req),
      req.user.user_id,
      query,
    );
  }

  @Patch('notifications/:id/read')
  @Roles('Dean', 'SuperAdmin')
  markRead(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.intelligence.markNotificationRead(
      this.tenant(req),
      req.user.user_id,
      id,
    );
  }

  @Patch('notifications/read-all')
  @Roles('Dean', 'SuperAdmin')
  markAllRead(@Req() req: { user: AuthUser }) {
    return this.intelligence.markAllNotificationsRead(
      this.tenant(req),
      req.user.user_id,
    );
  }

  @Get('activity')
  @Roles('Dean', 'SuperAdmin')
  activity(
    @Req() req: { user: AuthUser },
    @Query('limit') limit?: string,
    @Query('module') module?: string,
  ) {
    return this.intelligence.getActivityFeed(
      this.tenant(req),
      req.user.user_id,
      { limit: limit ? Number(limit) : undefined, module },
    );
  }

  @Get('audit-log')
  @Roles('Dean', 'SuperAdmin')
  auditLog(
    @Req() req: { user: AuthUser },
    @Query() query: DeanFilterQuery & ListQueryParams & { module?: string },
  ) {
    return this.intelligence.getAuditLog(
      this.tenant(req),
      req.user.user_id,
      query,
    );
  }

  @Get('approval-timeline/:type/:id')
  @Roles('Dean', 'SuperAdmin')
  approvalTimeline(
    @Req() req: { user: AuthUser },
    @Param('type') type: string,
    @Param('id') id: string,
  ) {
    return this.intelligence.getApprovalTimeline(
      this.tenant(req),
      req.user.user_id,
      type,
      id,
    );
  }

  @Get('reports/export')
  @Roles('Dean', 'SuperAdmin')
  async exportReport(
    @Req() req: { user: AuthUser },
    @Res() res: Response,
    @Query('type') type = 'all',
    @Query('format') format: 'pdf' | 'excel' | 'csv' = 'excel',
    @Query() query: DeanFilterQuery,
  ) {
    const file = await this.intelligence.exportReport(
      this.tenant(req),
      req.user.user_id,
      type,
      format,
      query,
    );
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    res.send(file.buffer);
  }

  @Get('result-approvals')
  @Roles('Dean', 'SuperAdmin')
  resultApprovals(
    @Req() req: { user: AuthUser },
    @Query() query: ListQueryParams,
  ) {
    return this.intelligence.listResultApprovals(
      this.tenant(req),
      req.user.user_id,
      query,
    );
  }

  @Post('result-approvals/:requestId/decision')
  @Roles('Dean', 'SuperAdmin')
  decideResultApproval(
    @Req() req: { user: AuthUser },
    @Param('requestId') requestId: string,
    @Body() dto: { decision: 'APPROVED' | 'REJECTED'; comment?: string },
  ) {
    return this.intelligence.decideResultApproval(
      this.tenant(req),
      req.user.user_id,
      requestId,
      dto.decision,
      dto.comment,
      {
        role: req.user.role ?? 'Dean',
      },
    );
  }

  @Get('result-approvals/session/:sessionId/history')
  @Roles('Dean', 'SuperAdmin')
  resultApprovalHistory(
    @Req() req: { user: AuthUser },
    @Param('sessionId') sessionId: string,
  ) {
    return this.intelligence.getResultApprovalHistory(
      this.tenant(req),
      sessionId,
    );
  }
}
