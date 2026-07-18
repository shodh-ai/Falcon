import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PresidentService } from './president.service';
import {
  ExecutiveActor,
  PresidentExecutiveWorkflowService,
} from './president-executive-workflow.service';

type AuthUser = {
  user_id: string;
  tenant_id?: string;
  role?: string;
  role_name?: string;
};

function actorFromReq(req: {
  user: AuthUser;
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}): ExecutiveActor {
  const forwarded = req.headers?.['x-forwarded-for'];
  return {
    userId: req.user.user_id,
    tenantId: req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001',
    role: req.user.role ?? req.user.role_name,
    ip:
      req.ip ??
      (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined),
    sessionId:
      typeof req.headers?.['x-session-id'] === 'string'
        ? req.headers['x-session-id']
        : undefined,
  };
}

@Controller('api/president')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('President', 'Vice Chancellor', 'SuperAdmin')
export class PresidentController {
  constructor(
    private readonly president: PresidentService,
    private readonly workflows: PresidentExecutiveWorkflowService,
  ) {}

  @Get('executive-summary')
  executiveSummary(@Req() req: { user: AuthUser }) {
    return this.president.getExecutiveSummary(req.user.tenant_id);
  }

  @Get('academics')
  academics(@Req() req: { user: AuthUser }) {
    return this.president.getAcademics(req.user.tenant_id);
  }

  @Get('finance')
  finance(@Req() req: { user: AuthUser }) {
    return this.president.getFinance(req.user.tenant_id);
  }

  @Get('compliance')
  compliance(@Req() req: { user: AuthUser }) {
    return this.president.getCompliance(req.user.tenant_id);
  }

  @Get('hr-analytics')
  hrAnalytics(@Req() req: { user: AuthUser }) {
    return this.president.getHrAnalytics(req.user.tenant_id);
  }

  @Get('finance-budget')
  financeBudget(@Req() req: { user: AuthUser }) {
    return this.president.getFinanceBudgetaryControl(req.user.tenant_id);
  }

  @Get('research')
  research(@Req() req: { user: AuthUser }) {
    return this.president.getResearchHub(req.user.tenant_id);
  }

  @Get('executive-orders')
  executiveOrders(@Req() req: { user: AuthUser }) {
    return this.president.getExecutiveOrders(req.user.tenant_id);
  }

  @Get('convocation')
  convocation(@Req() req: { user: AuthUser }) {
    return this.president.getConvocation(req.user.tenant_id);
  }

  @Get('hr-approvals')
  hrApprovals(@Req() req: { user: AuthUser }) {
    return this.president.getHrApprovals(req.user.tenant_id);
  }

  @Post('hr-approvals/:id/review')
  reviewHrApproval(
    @Req()
    req: {
      user: AuthUser;
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    @Param('id') id: string,
    @Body() body: { approve: boolean; note?: string },
  ) {
    return this.workflows.reviewHrApproval(
      actorFromReq(req),
      id,
      body.approve,
      body.note,
    );
  }

  @Post('executive-orders')
  createExecutiveOrder(
    @Req()
    req: {
      user: AuthUser;
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    @Body()
    body: {
      subject: string;
      body: string;
      destination_module: string;
      order_type?: string;
      assigned_to_user_id?: string;
    },
  ) {
    return this.workflows.createExecutiveOrder(actorFromReq(req), body);
  }

  @Patch('executive-orders/:id/status')
  updateExecutiveOrder(
    @Req()
    req: {
      user: AuthUser;
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    return this.workflows.updateExecutiveOrderStatus(
      actorFromReq(req),
      id,
      body.status,
    );
  }

  @Post('grievances/:ticketId/decide')
  grievanceDecision(
    @Req()
    req: {
      user: AuthUser;
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    @Param('ticketId') ticketId: string,
    @Body() body: { decision: string; assigned_officer_user_id?: string },
  ) {
    return this.workflows.presidentEscalateGrievance(
      actorFromReq(req),
      ticketId,
      body,
    );
  }

  @Get('convocation/pending-ratification')
  pendingRatification(@Req() req: { user: AuthUser }) {
    return this.workflows.listPendingRatifications(
      req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001',
    );
  }

  @Post('convocation/:applicationId/ratify')
  ratifyConvocation(
    @Req()
    req: {
      user: AuthUser;
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    @Param('applicationId') applicationId: string,
    @Body() body: { approve: boolean; note?: string },
  ) {
    return this.workflows.ratifyConvocation(
      actorFromReq(req),
      applicationId,
      body.approve,
      body.note,
    );
  }

  @Post('compliance/:assignmentId/action')
  complianceAction(
    @Req()
    req: {
      user: AuthUser;
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    @Param('assignmentId') assignmentId: string,
    @Body()
    body: {
      action:
        | 'ASSIGN_INVESTIGATION'
        | 'ESCALATE_DEPARTMENT'
        | 'REQUEST_REPORT'
        | 'MARK_REVIEWED';
      note?: string;
    },
  ) {
    return this.workflows.complianceAction(
      actorFromReq(req),
      assignmentId,
      body.action,
      body.note,
    );
  }

  @Post('meetings/:meetingId/action-items')
  meetingActionItems(
    @Req()
    req: {
      user: AuthUser;
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    @Param('meetingId') meetingId: string,
    @Body()
    body: {
      items: Array<{
        title: string;
        assigned_to_user_id: string;
        due_at?: string;
      }>;
    },
  ) {
    return this.workflows.createMeetingActionItems(
      actorFromReq(req),
      meetingId,
      body.items ?? [],
    );
  }

  @Get('admissions')
  admissions(@Req() req: { user: AuthUser }) {
    return this.president.getAdmissions(req.user.tenant_id);
  }

  @Get('placements')
  placements(@Req() req: { user: AuthUser }) {
    return this.president.getPlacementsOverview(req.user.tenant_id);
  }

  @Get('alumni-development')
  alumniDevelopment(@Req() req: { user: AuthUser }) {
    return this.president.getAlumniDevelopment(req.user.tenant_id);
  }

  @Get('achievements')
  achievements(@Req() req: { user: AuthUser }) {
    return this.president.getAchievements(req.user.tenant_id);
  }

  @Get('alerts')
  alerts(@Req() req: { user: AuthUser }) {
    return this.president.getAlerts(req.user.tenant_id);
  }
}
