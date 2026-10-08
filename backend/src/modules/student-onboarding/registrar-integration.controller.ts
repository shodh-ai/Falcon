import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { EnterpriseAuditService } from '../../core/audit/enterprise-audit.service';
import { OfficialTranscriptService } from '../exam-cell/official-transcript.service';

type AuthUser = {
  user_id: string;
  tenant_id?: string;
  role?: string;
  role_name?: string;
};

function auditActor(req: {
  user: AuthUser;
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}) {
  const forwarded = req.headers?.['x-forwarded-for'];
  return {
    userId: req.user.user_id,
    role: req.user.role ?? req.user.role_name,
    ip:
      req.ip ??
      (typeof forwarded === 'string'
        ? forwarded.split(',')[0]?.trim()
        : undefined),
    sessionId:
      typeof req.headers?.['x-session-id'] === 'string'
        ? req.headers['x-session-id']
        : undefined,
  };
}

@Controller('api/admin/registrar')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CampusAdmin', 'SuperAdmin', 'Registrar')
export class RegistrarIntegrationController {
  constructor(
    private readonly transcripts: OfficialTranscriptService,
    private readonly enterpriseAudit: EnterpriseAuditService,
  ) {}

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  @Get('transcripts')
  listTranscripts(
    @Req() req: { user: AuthUser },
    @Query('status') status?: string,
    @Query('semester') semester?: string,
  ) {
    return this.transcripts.listForTenant(this.tenant(req), {
      status,
      semester: semester ? Number(semester) : undefined,
    });
  }

  @Post('transcripts/generate')
  generateTranscripts(
    @Req()
    req: {
      user: AuthUser;
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    @Body() body: { semester: number },
  ) {
    return this.transcripts.requestForSemester(
      this.tenant(req),
      Number(body.semester),
      auditActor(req),
      true,
    );
  }

  @Post('transcripts/:id/approve')
  approveTranscript(
    @Req()
    req: {
      user: AuthUser;
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    @Param('id') id: string,
  ) {
    return this.transcripts.approve(this.tenant(req), id, auditActor(req));
  }

  @Get('audit')
  auditLog(
    @Req() req: { user: AuthUser },
    @Query('module') module?: string,
    @Query('limit') limit?: string,
  ) {
    return this.enterpriseAudit.listForTenant(this.tenant(req), {
      module,
      limit: limit ? Number(limit) : 100,
    });
  }
}
