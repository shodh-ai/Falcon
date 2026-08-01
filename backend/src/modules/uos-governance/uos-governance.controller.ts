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
import { UosGovernanceService } from './uos-governance.service';

type AuthUser = {
  tenant_id?: string;
  user_id: string;
  role?: string;
  roles?: string[];
};

@Controller('api/uos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UosGovernanceController {
  constructor(private readonly uos: UosGovernanceService) {}

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id;
  }

  private role(user: AuthUser) {
    return user.role ?? user.roles?.[0] ?? 'Faculty';
  }

  private userRoles(user: AuthUser): string[] {
    const merged = [...(user.roles ?? []), ...(user.role ? [user.role] : [])].filter(Boolean);
    return Array.from(new Set(merged));
  }

  // ALM
  @Get('assets/amc')
  @Roles('SuperAdmin', 'CampusAdmin', 'EstateOfficer', 'COO', 'Accountant', 'LabAdmin', 'Stores')
  listAmc(@Req() req: { user: AuthUser }) {
    return this.uos.listAmc(this.tenant(req));
  }

  @Post('assets/amc')
  @Roles('SuperAdmin', 'CampusAdmin', 'EstateOfficer', 'COO')
  createAmc(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      asset_id: string;
      vendor_name: string;
      start_date: string;
      end_date: string;
      amount_inr: number;
      notes?: string;
    },
  ) {
    return this.uos.createAmc(this.tenant(req), body);
  }

  @Get('assets/calibrations')
  @Roles('SuperAdmin', 'CampusAdmin', 'EstateOfficer', 'COO', 'LabAdmin')
  listCal(@Req() req: { user: AuthUser }) {
    return this.uos.listCalibrations(this.tenant(req));
  }

  @Post('assets/calibrations')
  @Roles('SuperAdmin', 'CampusAdmin', 'EstateOfficer', 'LabAdmin', 'COO')
  scheduleCal(
    @Req() req: { user: AuthUser },
    @Body() body: { asset_id: string; next_due_at: string },
  ) {
    return this.uos.scheduleCalibration(this.tenant(req), body);
  }

  @Post('assets/calibrations/run-alerts')
  @Roles('SuperAdmin', 'CampusAdmin', 'COO', 'EstateOfficer')
  runCalAlerts(@Req() req: { user: AuthUser }) {
    return this.uos.runCalibrationAlerts(this.tenant(req));
  }

  @Get('assets/writeoffs')
  @Roles(
    'SuperAdmin',
    'HOD',
    'EstateOfficer',
    'ITHead',
    'Accountant',
    'CFO',
    'APManager',
    'LabAdmin',
    'Stores',
    'COO',
  )
  listWriteoffs(@Req() req: { user: AuthUser }) {
    return this.uos.listWriteoffs(this.tenant(req));
  }

  @Post('assets/writeoffs')
  @Roles('SuperAdmin', 'LabAdmin', 'Stores', 'Faculty', 'HOD')
  requestWriteoff(
    @Req() req: { user: AuthUser },
    @Body() body: { asset_id: string; reason: string },
  ) {
    return this.uos.requestWriteoff(this.tenant(req), req.user.user_id, body);
  }

  @Post('assets/writeoffs/:id/advance')
  @Roles(
    'HOD',
    'EstateOfficer',
    'ITHead',
    'COO',
    'Accountant',
    'CFO',
    'APManager',
    'FinanceController',
    'SuperAdmin',
  )
  advanceWriteoff(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body?: { decision?: 'APPROVED' | 'REJECTED' },
  ) {
    return this.uos.advanceWriteoff(
      this.tenant(req),
      req.user.user_id,
      this.userRoles(req.user),
      id,
      body?.decision ?? 'APPROVED',
    );
  }

  // SIS
  @Get('sis/grade-changes')
  @Roles(
    'Faculty',
    'HOD',
    'Dean',
    'ExamCell',
    'ExamAdmin',
    'DeputyCoE',
    'SuperAdmin',
    'CampusAdmin',
    'LabAdmin',
  )
  listGrade(@Req() req: { user: AuthUser }) {
    return this.uos.listGradeChanges(this.tenant(req));
  }

  @Post('sis/grade-changes')
  @Roles('Faculty', 'HOD', 'SuperAdmin')
  createGrade(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      student_user_id: string;
      course_code: string;
      course_name?: string;
      from_grade: string;
      to_grade: string;
      reason: string;
    },
  ) {
    return this.uos.createGradeChange(this.tenant(req), req.user.user_id, body);
  }

  @Post('sis/grade-changes/:id/advance')
  @Roles('HOD', 'Dean', 'ExamCell', 'ExamAdmin', 'DeputyCoE', 'CampusAdmin', 'SuperAdmin')
  advanceGrade(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.uos.advanceGradeChange(
      this.tenant(req),
      req.user.user_id,
      this.userRoles(req.user),
      id,
    );
  }

  @Get('sis/curriculum')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin', 'CampusAdmin', 'IQAC', 'LabAdmin')
  listCurriculum(@Req() req: { user: AuthUser }) {
    return this.uos.listCurriculum(this.tenant(req));
  }

  @Post('sis/curriculum')
  @Roles('Faculty', 'HOD', 'SuperAdmin', 'LabAdmin', 'Dean')
  createCurriculum(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      title: string;
      syllabus_pdf_path: string;
      program_code?: string;
      course_code?: string;
      effective_term?: string;
    },
  ) {
    return this.uos.createCurriculum(this.tenant(req), req.user.user_id, body);
  }

  @Post('sis/curriculum/:id/bos-sign')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin', 'LabAdmin')
  bosSign(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.uos.signCurriculumBos(
      this.tenant(req),
      req.user.user_id,
      this.role(req.user),
      id,
    );
  }

  @Post('sis/curriculum/:id/finalize')
  @Roles('Dean', 'CampusAdmin', 'SuperAdmin')
  finalizeCurriculum(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.uos.finalizeCurriculum(this.tenant(req), req.user.user_id, id);
  }

  // Legal
  @Get('legal/mous')
  @Roles(
    'LegalOfficer',
    'Dean',
    'President',
    'Chairman',
    'SuperAdmin',
    'IQAC',
    'CampusAdmin',
  )
  listMous(@Req() req: { user: AuthUser }) {
    return this.uos.listMous(this.tenant(req));
  }

  @Post('legal/mous')
  @Roles('LegalOfficer', 'Dean', 'LabAdmin', 'Faculty', 'SuperAdmin', 'COO')
  submitMou(
    @Req() req: { user: AuthUser },
    @Body() body: { title: string; counterparty?: string; pdf_path?: string },
  ) {
    return this.uos.submitMou(this.tenant(req), req.user.user_id, body);
  }

  @Post('legal/mous/:id/advance')
  @Roles('LegalOfficer', 'Dean', 'President', 'Chairman', 'SuperAdmin')
  advanceMou(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.uos.advanceMou(
      this.tenant(req),
      req.user.user_id,
      this.role(req.user),
      id,
    );
  }

  @Get('accreditation/evidence')
  @Roles('IQAC', 'Chairman', 'President', 'SuperAdmin', 'Dean', 'CampusAdmin')
  evidence(@Req() req: { user: AuthUser }) {
    return this.uos.listEvidence(this.tenant(req));
  }

  // Space
  @Get('space/bookings')
  @Roles(
    'Student',
    'Faculty',
    'HOD',
    'EstateOfficer',
    'Security',
    'COO',
    'CampusAdmin',
    'SuperAdmin',
  )
  spaceBookings(@Req() req: { user: AuthUser }) {
    return this.uos.listSpaceBookings(this.tenant(req));
  }

  @Post('space/bookings/:id/advance')
  @Roles(
    'Faculty',
    'HOD',
    'EstateOfficer',
    'Security',
    'COO',
    'CampusAdmin',
    'SuperAdmin',
  )
  advanceSpace(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.uos.advanceSpaceDofa(
      this.tenant(req),
      req.user.user_id,
      this.role(req.user),
      id,
    );
  }
}
