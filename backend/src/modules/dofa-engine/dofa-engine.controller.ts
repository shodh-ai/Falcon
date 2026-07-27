import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DofaEngineService, type DofaDomain } from './dofa-engine.service';

type AuthUser = {
  tenant_id?: string;
  user_id: string;
  role?: string;
  roles?: string[];
};

const DOFA_ROLES = [
  'SuperAdmin',
  'CampusAdmin',
  'Chairman',
  'President',
  'COO',
  'CFO',
  'Dean',
  'HOD',
  'HR',
  'HRAdmin',
  'ExamCell',
  'ExamAdmin',
  'DeputyCoE',
  'Faculty',
  'LabAdmin',
  'Accountant',
  'APManager',
  'APClerk',
  'FinanceController',
  'EstateOfficer',
  'Security',
  'LegalOfficer',
  'Procurement',
  'ProcurementHead',
  'ProcurementBuyer',
  'Stores',
  'ReceivingClerk',
  'InternalAuditor',
] as const;

@Controller('api/dofa')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DofaEngineController {
  constructor(private readonly dofa: DofaEngineService) {}

  private role(user: AuthUser) {
    return user.role ?? user.roles?.[0] ?? 'Faculty';
  }

  @Post('cases')
  @Roles(...DOFA_ROLES)
  open(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      domain: DofaDomain;
      title: string;
      amount?: number;
      source_table?: string;
      source_id?: string;
      payload?: Record<string, unknown>;
      rule_key?: string;
      escalate_now?: boolean;
      exception_reason?: string;
    },
  ) {
    return this.dofa.openCase(req.user.tenant_id, {
      ...body,
      requester_id: req.user.user_id,
    });
  }

  @Get('cases/:id')
  @Roles(...DOFA_ROLES)
  getCase(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.dofa.getCase(req.user.tenant_id, id);
  }

  @Get('inbox')
  @Roles(...DOFA_ROLES)
  inbox(@Req() req: { user: AuthUser }) {
    return this.dofa.inbox(req.user.tenant_id, this.role(req.user));
  }

  @Get('exceptions')
  @Roles('Chairman', 'President', 'SuperAdmin', 'CampusAdmin', 'COO', 'CFO')
  exceptions(@Req() req: { user: AuthUser }) {
    return this.dofa.exceptions(req.user.tenant_id);
  }

  @Post('cases/:id/decide')
  @Roles(...DOFA_ROLES)
  decide(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: { decision: 'APPROVED' | 'REJECTED'; notes?: string },
  ) {
    return this.dofa.decide(
      req.user.tenant_id,
      req.user.user_id,
      this.role(req.user),
      id,
      body,
    );
  }

  @Get('headcount')
  @Roles('HOD', 'Dean', 'HR', 'HRAdmin', 'CFO', 'Chairman', 'President', 'SuperAdmin', 'CampusAdmin')
  listHeadcount(@Req() req: { user: AuthUser }) {
    return this.dofa.listHeadcount(req.user.tenant_id);
  }

  @Post('headcount')
  @Roles('HOD', 'Dean', 'HR', 'HRAdmin', 'SuperAdmin', 'CampusAdmin')
  createHeadcount(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      job_title: string;
      department?: string;
      ctc_annual: number;
      candidate_email?: string;
      candidate_name?: string;
    },
  ) {
    return this.dofa.openHeadcountRequest(
      req.user.tenant_id,
      req.user.user_id,
      body,
    );
  }
}
