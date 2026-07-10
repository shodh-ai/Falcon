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
import { PhdLifecycleService } from './phd-lifecycle.service';

type AuthUser = {
  user_id: string;
  tenant_id?: string;
  role?: string;
  primaryRole?: string;
};

@Controller('api/phd-lifecycle')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PhdLifecycleController {
  constructor(private readonly phd: PhdLifecycleService) {}

  @Get('applications/eligibility')
  @Roles('Student', 'Applicant', 'SuperAdmin')
  applicationEligibility(@Req() req: { user: AuthUser }) {
    const role = req.user.primaryRole ?? req.user.role;
    return this.phd.getApplicationEligibility(
      this.tenant(req),
      req.user.user_id,
      role,
    );
  }

  @Post('applications')
  @Roles('Student', 'Applicant', 'SuperAdmin')
  createApplication(
    @Req() req: { user: AuthUser },
    @Body()
    dto: {
      application_type?: string;
      proposed_topic?: string;
      applicant_name?: string;
      applicant_email?: string;
      document_urls?: string[];
      entrance_exam_type?: string;
      entrance_score?: number;
      direct_phd_merit_approved?: boolean;
    },
  ) {
    const role = req.user.primaryRole ?? req.user.role;
    return this.phd.createApplication(
      this.tenant(req),
      req.user.user_id,
      dto,
      role,
    );
  }

  @Get('applications/mine')
  @Roles('Student', 'Applicant', 'SuperAdmin')
  myApplications(@Req() req: { user: AuthUser }) {
    return this.phd.listMyApplications(this.tenant(req), req.user.user_id);
  }

  @Get('guide/scholars')
  @Roles('Faculty', 'SuperAdmin')
  guideScholars(@Req() req: { user: AuthUser }) {
    return this.phd.listGuideScholars(this.tenant(req), req.user.user_id);
  }

  @Get('drc/candidates')
  @Roles('DRC_MEMBER', 'SuperAdmin')
  drcQueue(@Req() req: { user: AuthUser }) {
    return this.phd.listForRole(
      this.tenant(req),
      'DRC_MEMBER',
      req.user.user_id,
    );
  }

  @Get('rac/candidates')
  @Roles('RAC_MEMBER', 'SuperAdmin')
  racQueue(@Req() req: { user: AuthUser }) {
    return this.phd.listForRole(
      this.tenant(req),
      'RAC_MEMBER',
      req.user.user_id,
    );
  }

  @Get('rrc/candidates')
  @Roles('RRC_MEMBER', 'SuperAdmin')
  rrcQueue(@Req() req: { user: AuthUser }) {
    return this.phd.listForRole(
      this.tenant(req),
      'RRC_MEMBER',
      req.user.user_id,
    );
  }

  @Get('adjudicator/candidates')
  @Roles('PHD_ADJUDICATOR', 'SuperAdmin')
  adjudicatorQueue(@Req() req: { user: AuthUser }) {
    return this.phd.listForRole(
      this.tenant(req),
      'PHD_ADJUDICATOR',
      req.user.user_id,
    );
  }

  @Get('registrar/candidates')
  @Roles('Registrar', 'SuperAdmin')
  registrarQueue(@Req() req: { user: AuthUser }) {
    return this.phd.listForRole(
      this.tenant(req),
      'Registrar',
      req.user.user_id,
    );
  }

  @Get('dean/candidates')
  @Roles('Dean', 'Leadership', 'President', 'SuperAdmin')
  deanQueue(@Req() req: { user: AuthUser }) {
    return this.phd.listForRole(this.tenant(req), 'Dean', req.user.user_id);
  }

  @Get('candidates')
  @Roles('IQAC', 'Dean', 'Chairman', 'SuperAdmin')
  allCandidates(@Req() req: { user: AuthUser }) {
    return this.phd.listForRole(
      this.tenant(req),
      'SuperAdmin',
      req.user.user_id,
    );
  }

  @Get('guide-options')
  @Roles('DRC_MEMBER', 'RAC_MEMBER', 'SuperAdmin')
  guideOptions(@Req() req: { user: AuthUser }) {
    return this.phd.listGuideOptions(this.tenant(req));
  }

  @Get('candidates/:id')
  @Roles(
    'Student',
    'Applicant',
    'Faculty',
    'DRC_MEMBER',
    'RAC_MEMBER',
    'RRC_MEMBER',
    'PHD_ADJUDICATOR',
    'Registrar',
    'Accountant',
    'Dean',
    'Leadership',
    'President',
    'SuperAdmin',
  )
  getCandidate(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.phd.getCandidate(this.tenant(req), id);
  }

  @Post('candidates/:id/action')
  @Roles(
    'Student',
    'Applicant',
    'Faculty',
    'DRC_MEMBER',
    'RAC_MEMBER',
    'RRC_MEMBER',
    'PHD_ADJUDICATOR',
    'Registrar',
    'Accountant',
    'Dean',
    'Leadership',
    'President',
    'SuperAdmin',
  )
  performAction(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body()
    dto: {
      action?: string;
      remarks?: string;
      guide_user_id?: string;
      semester?: number;
      document_urls?: string[];
      notes?: string;
    },
  ) {
    const role = req.user.primaryRole ?? req.user.role ?? 'SuperAdmin';
    return this.phd.performAction(
      this.tenant(req),
      req.user.user_id,
      role,
      id,
      dto,
    );
  }

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }
}
