import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  POLICY_AUDIT_ROLES,
  POLICY_PROPOSE_ROLES,
  POLICY_READ_ROLES,
  POLICY_UNLOCK_ROLES,
} from './dofa-policy.constants';
import {
  DofaPolicyService,
  type PolicyDomain,
} from './dofa-policy.service';

type AuthUser = {
  tenant_id?: string;
  user_id: string;
  role?: string;
  roles?: string[];
};

@Controller('api/dofa/policy')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DofaPolicyController {
  constructor(private readonly policy: DofaPolicyService) {}

  private role(user: AuthUser) {
    const all = [
      ...(user.roles ?? []),
      ...(user.role ? [user.role] : []),
    ];
    const prefer = [
      'CFO',
      'CampusAdmin',
      'SuperAdmin',
      'CIO',
      'Chairman',
      'President',
      'InternalAuditor',
    ];
    for (const p of prefer) {
      const hit = all.find((r) => r.toLowerCase() === p.toLowerCase());
      if (hit) return hit;
    }
    return all[0] ?? 'Faculty';
  }

  @Get('graphs')
  @Roles(...POLICY_READ_ROLES)
  list(
    @Req() req: { user: AuthUser },
    @Query('domain') domain?: string,
  ) {
    return this.policy.listGraphs(req.user.tenant_id, domain);
  }

  @Get('graphs/:id')
  @Roles(...POLICY_READ_ROLES)
  get(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.policy.getGraph(req.user.tenant_id, id);
  }

  @Post('graphs')
  @Roles(...POLICY_PROPOSE_ROLES)
  create(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      domain: PolicyDomain;
      title: string;
      graph_json: {
        nodes?: Array<{
          id: string;
          type?: string;
          position?: { x: number; y: number };
          data?: Record<string, unknown>;
        }>;
        edges?: Array<{ id?: string; source: string; target: string }>;
      };
      compiled_matrix?: Array<Record<string, unknown>>;
      proposal_memo: string;
      minutes_ref: string;
    },
  ) {
    return this.policy.createDraft(
      req.user.tenant_id,
      req.user.user_id,
      this.role(req.user),
      body as Parameters<DofaPolicyService['createDraft']>[3],
    );
  }

  @Put('graphs/:id')
  @Roles(...POLICY_PROPOSE_ROLES)
  update(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body()
    body: {
      title?: string;
      graph_json?: Parameters<DofaPolicyService['updateDraft']>[4]['graph_json'];
      compiled_matrix?: Parameters<DofaPolicyService['updateDraft']>[4]['compiled_matrix'];
      proposal_memo?: string;
      minutes_ref?: string;
    },
  ) {
    return this.policy.updateDraft(
      req.user.tenant_id,
      req.user.user_id,
      this.role(req.user),
      id,
      body,
    );
  }

  @Post('graphs/:id/submit')
  @Roles(...POLICY_PROPOSE_ROLES)
  submit(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.policy.submit(
      req.user.tenant_id,
      req.user.user_id,
      this.role(req.user),
      id,
    );
  }

  @Post('graphs/:id/request-otp')
  @Roles(...POLICY_UNLOCK_ROLES)
  requestOtp(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.policy.requestOtp(
      req.user.tenant_id,
      req.user.user_id,
      this.role(req.user),
      id,
    );
  }

  /** Dual-key unlock + publish in one step after OTP verify */
  @Post('graphs/:id/unlock')
  @Roles(...POLICY_UNLOCK_ROLES)
  unlock(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: { otp: string },
  ) {
    return this.policy.unlockAndPublish(
      req.user.tenant_id,
      req.user.user_id,
      this.role(req.user),
      id,
      body.otp,
    );
  }

  @Post('graphs/:id/publish')
  @Roles(...POLICY_UNLOCK_ROLES)
  publish(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: { otp: string },
  ) {
    return this.policy.unlockAndPublish(
      req.user.tenant_id,
      req.user.user_id,
      this.role(req.user),
      id,
      body.otp,
    );
  }

  @Post('graphs/:id/reject')
  @Roles('CFO', 'Chairman', 'President', 'SuperAdmin')
  reject(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: { notes?: string },
  ) {
    return this.policy.reject(
      req.user.tenant_id,
      req.user.user_id,
      this.role(req.user),
      id,
      body?.notes,
    );
  }

  @Get('audit')
  @Roles(...POLICY_AUDIT_ROLES)
  audit(
    @Req() req: { user: AuthUser },
    @Query('graph_id') graphId?: string,
  ) {
    return this.policy.listAudit(req.user.tenant_id, graphId);
  }
}
