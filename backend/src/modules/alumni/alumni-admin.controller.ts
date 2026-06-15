import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AlumniAdminService } from './alumni-admin.service';
import { AlumniConversionService } from './alumni-conversion.service';

type AuthUser = { user_id: string; tenant_id?: string };

@Controller('api/alumni-admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AlumniAdminController {
  constructor(
    private readonly admin: AlumniAdminService,
    private readonly conversion: AlumniConversionService,
  ) {}

  @Get('verification-queue')
  @Roles('IQAC', 'Registrar')
  verificationQueue(@Req() req: { user: AuthUser }) {
    return this.admin.verificationQueue(this.tenant(req));
  }

  @Get('verification')
  @Roles('IQAC', 'Registrar')
  listVerificationInbox(@Req() req: { user: AuthUser }) {
    return this.admin.listConversionVerifications(this.tenant(req));
  }

  @Get('verifications')
  @Roles('IQAC', 'Registrar')
  listVerifications(@Req() req: { user: AuthUser }) {
    return this.admin.listConversionVerifications(this.tenant(req));
  }

  @Post('verification/:alumniId/approve')
  @Roles('IQAC', 'Registrar')
  approveVerificationInbox(
    @Req() req: { user: AuthUser },
    @Param('alumniId') alumniId: string,
  ) {
    return this.admin.approveConversion(this.tenant(req), alumniId, req.user.user_id);
  }

  @Post('verifications/:alumniId/approve')
  @Roles('IQAC', 'Registrar')
  approveVerification(
    @Req() req: { user: AuthUser },
    @Param('alumniId') alumniId: string,
  ) {
    return this.admin.approveConversion(this.tenant(req), alumniId, req.user.user_id);
  }

  @Post('verifications/:alumniId/reject')
  @Roles('IQAC', 'Registrar')
  rejectVerification(
    @Req() req: { user: AuthUser },
    @Param('alumniId') alumniId: string,
  ) {
    return this.admin.verifyProfile(this.tenant(req), alumniId, req.user.user_id, { action: 'reject' });
  }

  @Patch('profiles/:alumniId/verify')
  @Roles('IQAC', 'Registrar')
  verify(
    @Req() req: { user: AuthUser },
    @Param('alumniId') alumniId: string,
    @Body() dto: { action: 'approve' | 'reject' },
  ) {
    return this.admin.verifyProfile(this.tenant(req), alumniId, req.user.user_id, dto);
  }

  @Get('donations')
  @Roles('IQAC', 'SuperAdmin', 'Registrar')
  donations(@Req() req: { user: AuthUser }) {
    return this.admin.donationLedger(this.tenant(req));
  }

  @Get('donations/summary')
  @Roles('IQAC', 'SuperAdmin', 'Registrar')
  donationSummary(@Req() req: { user: AuthUser }) {
    return this.admin.donationSummary(this.tenant(req));
  }

  @Get('analytics')
  @Roles('IQAC', 'SuperAdmin', 'Registrar', 'President')
  analytics(@Req() req: { user: AuthUser }) {
    return this.admin.engagementAnalytics(this.tenant(req));
  }

  @Get('events')
  @Roles('IQAC', 'SuperAdmin', 'Registrar')
  events(@Req() req: { user: AuthUser }) {
    return this.admin.listEventsAdmin(this.tenant(req));
  }

  @Post('events')
  @Roles('IQAC', 'SuperAdmin', 'Registrar')
  createEvent(
    @Req() req: { user: AuthUser },
    @Body() dto: { title: string; event_date: string; venue?: string; description?: string },
  ) {
    return this.admin.createEvent(this.tenant(req), dto);
  }

  @Patch('events/:eventId')
  @Roles('IQAC', 'SuperAdmin', 'Registrar')
  updateEvent(
    @Req() req: { user: AuthUser },
    @Param('eventId') eventId: string,
    @Body() dto: Partial<{ title: string; event_date: string; venue: string; description: string; is_published: boolean }>,
  ) {
    return this.admin.updateEvent(this.tenant(req), eventId, dto);
  }

  @Get('profiles')
  @Roles('IQAC', 'SuperAdmin', 'Registrar')
  profiles(@Req() req: { user: AuthUser }) {
    return this.admin.allProfiles(this.tenant(req));
  }

  @Post('conversion/scan')
  @Roles('IQAC', 'SuperAdmin', 'Registrar')
  scanConversions(@Req() req: { user: AuthUser }) {
    return this.conversion.scanGraduatesForConversion(this.tenant(req));
  }

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? '';
  }
}
