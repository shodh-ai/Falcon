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
import { CertificateAutomationService } from './certificate-automation.service';
import { UpsertCertEventDto } from './dto/upsert-event.dto';
import { ApplyCertEventDto } from './dto/apply.dto';

type AuthUser = {
  user_id: string;
  tenant_id?: string;
  role?: string;
};

@Controller('api/certificate-automation')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CertificateAutomationController {
  constructor(private readonly certs: CertificateAutomationService) {}

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  @Get('events/active')
  @Roles('Student', 'SuperAdmin', 'Registrar')
  activeEvent(@Req() req: { user: AuthUser }) {
    return this.certs.getActiveEvent(this.tenant(req));
  }

  @Get('events')
  @Roles('SuperAdmin', 'Registrar')
  listEvents(@Req() req: { user: AuthUser }) {
    return this.certs.listEvents(this.tenant(req));
  }

  @Post('events')
  @Roles('SuperAdmin', 'Registrar')
  createEvent(@Req() req: { user: AuthUser }, @Body() dto: UpsertCertEventDto) {
    return this.certs.upsertEvent(this.tenant(req), dto);
  }

  @Get('applications/mine')
  @Roles('Student')
  myApplications(@Req() req: { user: AuthUser }) {
    return this.certs.listMyApplications(this.tenant(req), req.user.user_id);
  }

  @Post('applications/apply')
  @Roles('Student')
  apply(@Req() req: { user: AuthUser }, @Body() dto: ApplyCertEventDto) {
    return this.certs.initiateApplication(
      this.tenant(req),
      req.user.user_id,
      dto.event_id,
    );
  }

  @Get('applications/pending-verification')
  @Roles('SuperAdmin', 'Registrar')
  pendingVerification(@Req() req: { user: AuthUser }) {
    return this.certs.listPendingVerification(this.tenant(req));
  }

  @Get('events/:eventId/applications')
  @Roles('SuperAdmin', 'Registrar')
  eventApplications(
    @Req() req: { user: AuthUser },
    @Param('eventId') eventId: string,
  ) {
    return this.certs.listEventApplications(this.tenant(req), eventId);
  }

  @Post('applications/:id/verify')
  @Roles('SuperAdmin', 'Registrar')
  verify(
    @Req() req: { user: AuthUser; ip?: string; headers?: Record<string, string | string[] | undefined> },
    @Param('id') id: string,
    @Body() body: { action: 'approve' | 'reject' },
  ) {
    const forwarded = req.headers?.['x-forwarded-for'];
    return this.certs.verifyApplication(
      this.tenant(req),
      id,
      req.user.user_id,
      body.action,
      {
        role: req.user.role,
        ip:
          req.ip ??
          (typeof forwarded === 'string'
            ? forwarded.split(',')[0]?.trim()
            : undefined),
        sessionId:
          typeof req.headers?.['x-session-id'] === 'string'
            ? req.headers['x-session-id']
            : undefined,
      },
    );
  }

  @Post('events/:eventId/generate-certificates')
  @Roles('SuperAdmin', 'Registrar')
  generateCertificates(
    @Req() req: { user: AuthUser },
    @Param('eventId') eventId: string,
  ) {
    return this.certs.enqueueCertificateGeneration(
      this.tenant(req),
      eventId,
      req.user.user_id,
    );
  }
}
