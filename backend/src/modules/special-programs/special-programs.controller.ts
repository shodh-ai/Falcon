import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { rolesIntersect } from '../../common/config/campus-admin.roles';
import { SpecialProgramsService } from './special-programs.service';

type AuthUser = {
  user_id: string;
  tenant_id?: string;
  role?: string;
  roles?: string[];
};

@Controller('api/special-programs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SpecialProgramsController {
  constructor(private readonly programs: SpecialProgramsService) {}

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  /** Students see only their artifacts; staff see all tenant artifacts unless filtered. */
  private artifactScopeUserId(
    user: AuthUser,
    studentUserId?: string,
  ): string | undefined {
    if (studentUserId) return studentUserId;
    const userRoles = [
      ...(user.roles ?? []),
      ...(user.role ? [user.role] : []),
    ];
    const canListAll = rolesIntersect(userRoles, [
      'ExamCell',
      'Dean',
      'Registrar',
      'PoP',
      'SuperAdmin',
      'CampusAdmin',
    ]);
    return canListAll ? undefined : user.user_id;
  }

  @Get()
  @Roles(
    'Student',
    'PoP',
    'Dean',
    'Registrar',
    'HR',
    'HRAdmin',
    'SuperAdmin',
    'CampusAdmin',
    'COO',
    'Chairman',
    'President',
  )
  list(@Req() req: { user: AuthUser }) {
    return this.programs.listPrograms(this.tenant(req));
  }

  @Get('enrollments')
  @Roles('PoP', 'Dean', 'Registrar', 'SuperAdmin', 'CampusAdmin', 'Student')
  enrollments(@Req() req: { user: AuthUser }, @Query('code') code?: string) {
    return this.programs.listEnrollments(this.tenant(req), code);
  }

  @Post('enroll')
  @Roles('Student', 'Dean', 'Registrar', 'SuperAdmin')
  enroll(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      program_id: string;
      student_user_id?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    return this.programs.enroll(
      this.tenant(req),
      body.student_user_id ?? req.user.user_id,
      body.program_id,
      body.metadata,
    );
  }

  @Get('pop')
  @Roles('PoP', 'Dean', 'HR', 'HRAdmin', 'SuperAdmin', 'CampusAdmin')
  pop(@Req() req: { user: AuthUser }) {
    return this.programs.listPop(this.tenant(req));
  }

  @Post('pop')
  @Roles('HR', 'HRAdmin', 'Dean', 'SuperAdmin', 'CampusAdmin')
  upsertPop(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      user_id: string;
      title?: string;
      bio?: string;
      equity_incentive_pct?: number;
      linked_ecell_project_ids?: string[];
    },
  ) {
    return this.programs.upsertPop(this.tenant(req), body);
  }

  @Get('portfolio/artifacts')
  @Roles(
    'Student',
    'ExamCell',
    'Dean',
    'Registrar',
    'PoP',
    'SuperAdmin',
    'CampusAdmin',
  )
  artifacts(
    @Req() req: { user: AuthUser },
    @Query('student_user_id') studentUserId?: string,
  ) {
    return this.programs.listArtifacts(
      this.tenant(req),
      this.artifactScopeUserId(req.user, studentUserId),
    );
  }

  @Post('portfolio/artifacts')
  @Roles('Student', 'PoP', 'SuperAdmin')
  addArtifact(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      artifact_type: string;
      title: string;
      url?: string;
      evidence_json?: Record<string, unknown>;
      student_user_id?: string;
    },
  ) {
    return this.programs.addArtifact(
      this.tenant(req),
      body.student_user_id ?? req.user.user_id,
      body,
    );
  }

  @Post('portfolio/publish')
  @Roles('ExamCell', 'Dean', 'Registrar', 'PoP', 'SuperAdmin', 'Student')
  publish(
    @Req() req: { user: AuthUser },
    @Body() body: { student_user_id?: string; mode?: string },
  ) {
    return this.programs.publishTranscript(
      this.tenant(req),
      body.student_user_id ?? req.user.user_id,
      body.mode ?? 'PORTFOLIO',
    );
  }

  @Get('hs-direct')
  @Roles(
    'AdmissionsOfficer',
    'Registrar',
    'Dean',
    'SuperAdmin',
    'CampusAdmin',
    'PoP',
  )
  hsDirect(@Req() req: { user: AuthUser }) {
    return this.programs.listHsDirect(this.tenant(req));
  }

  @Post('hs-direct')
  @Roles('AdmissionsOfficer', 'Registrar', 'Dean', 'SuperAdmin', 'CampusAdmin')
  createHs(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      email?: string;
      lead_id?: string;
      grade_level?: string;
      checklist?: Record<string, unknown>;
    },
  ) {
    return this.programs.createHsDirect(this.tenant(req), body);
  }
}
