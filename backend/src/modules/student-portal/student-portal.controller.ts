import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { StudentPortalService } from './student-portal.service';

type AuthUser = { user_id: string; tenant_id?: string };

@Controller('api/student')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Student', 'Applicant')
export class StudentPortalController {
  constructor(private readonly portal: StudentPortalService) {}

  @Get('profile')
  profile(@Req() req: { user: AuthUser }) {
    return this.portal.getMasterProfile(this.tenant(req), req.user.user_id);
  }

  @Get('admission-vault')
  admissionVault(@Req() req: { user: AuthUser }) {
    return this.portal.getAdmissionVault(this.tenant(req), req.user.user_id);
  }

  @Get('registration')
  registration(@Req() req: { user: AuthUser }) {
    return this.portal.getRegistration(this.tenant(req), req.user.user_id);
  }

  @Get('attendance')
  attendance(@Req() req: { user: AuthUser }) {
    return this.portal.getAttendance(this.tenant(req), req.user.user_id);
  }

  @Get('marks')
  marks(@Req() req: { user: AuthUser }) {
    return this.portal.getMarks(this.tenant(req), req.user.user_id);
  }

  @Get('exam-desk')
  examDesk(@Req() req: { user: AuthUser }) {
    return this.portal.getExamDesk(this.tenant(req), req.user.user_id);
  }

  @Get('extracurriculars')
  extracurriculars(@Req() req: { user: AuthUser }) {
    return this.portal.getExtracurriculars(this.tenant(req), req.user.user_id);
  }

  @Get('discipline')
  discipline(@Req() req: { user: AuthUser }) {
    return this.portal.getDiscipline(this.tenant(req), req.user.user_id);
  }

  @Get('mentorship/alumni')
  alumniMentors(@Req() req: { user: AuthUser }) {
    return this.portal.listAlumniMentors(this.tenant(req));
  }

  @Get('exit')
  exit(@Req() req: { user: AuthUser }) {
    return this.portal.getExit(this.tenant(req), req.user.user_id);
  }

  @Get('library')
  library(@Req() req: { user: AuthUser }) {
    return this.portal.getLibrary(this.tenant(req), req.user.user_id);
  }

  @Get('transport')
  transport(@Req() req: { user: AuthUser }) {
    return this.portal.getTransport(this.tenant(req), req.user.user_id);
  }

  @Get('placements')
  placements(@Req() req: { user: AuthUser }) {
    return this.portal.getPlacements(this.tenant(req), req.user.user_id);
  }

  @Post('profile/update-request')
  profileUpdateRequest(
    @Req() req: { user: AuthUser },
    @Body() body: { subject?: string; description?: string; fields_requested?: string[] },
  ) {
    return this.portal.requestProfileUpdate(this.tenant(req), req.user.user_id, {
      subject: body.subject ?? 'Profile update request',
      description: body.description ?? '',
      fields_requested: body.fields_requested,
    });
  }

  @Post('exit/alumni-register')
  alumniRegister(
    @Req() req: { user: AuthUser },
    @Body() body: { linkedin_url?: string; placement_organization?: string },
  ) {
    return this.portal.registerAlumni(this.tenant(req), req.user.user_id, body);
  }

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }
}
