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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MoonshotsService } from './moonshots.service';

type AuthUser = { user_id: string; tenant_id?: string; roles?: string[] };

@Controller('api/moonshots')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MoonshotsController {
  constructor(private readonly moonshots: MoonshotsService) {}

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  private roles(req: { user: AuthUser }) {
    return (req.user.roles ?? []).map((r) => r.toLowerCase());
  }

  @Get('programs')
  @Roles(
    'Student',
    'Faculty',
    'HOD',
    'LabAdmin',
    'Wrangler',
    'IQAC',
    'Dean',
    'SuperAdmin',
    'CampusAdmin',
    'COO',
    'Chairman',
    'President',
  )
  programs(@Req() req: { user: AuthUser }) {
    return this.moonshots.listPrograms(this.tenant(req));
  }

  @Get('projects')
  @Roles(
    'Student',
    'Faculty',
    'HOD',
    'LabAdmin',
    'Wrangler',
    'IQAC',
    'Dean',
    'SuperAdmin',
    'CampusAdmin',
    'COO',
    'Chairman',
    'President',
  )
  projects(@Req() req: { user: AuthUser }) {
    const roles = this.roles(req);
    const isStudentOnly =
      roles.includes('student') &&
      !roles.some((r) =>
        [
          'faculty',
          'labadmin',
          'wrangler',
          'iqac',
          'dean',
          'superadmin',
          'campusadmin',
          'hod',
        ].includes(r),
      );
    if (isStudentOnly) {
      return this.moonshots.listProjects(this.tenant(req), {
        studentUserId: req.user.user_id,
      });
    }
    if (
      roles.includes('faculty') &&
      !roles.some((r) => ['dean', 'superadmin', 'iqac'].includes(r))
    ) {
      return this.moonshots.listProjects(this.tenant(req), {
        guideUserId: req.user.user_id,
      });
    }
    return this.moonshots.listProjects(this.tenant(req));
  }

  @Get('projects/mine')
  @Roles('Student')
  mine(@Req() req: { user: AuthUser }) {
    return this.moonshots.listProjects(this.tenant(req), {
      studentUserId: req.user.user_id,
    });
  }

  @Post('projects')
  @Roles('Student', 'Faculty', 'SuperAdmin')
  create(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      program_id: string;
      title: string;
      disclosure_notes?: string;
      student_user_id?: string;
    },
  ) {
    const roles = this.roles(req);
    const asFaculty = roles.includes('faculty') || roles.includes('superadmin');
    const isStudent = roles.includes('student') && !asFaculty;
    return this.moonshots.createProject(
      this.tenant(req),
      req.user.user_id,
      body,
      isStudent ? 'student' : 'faculty',
    );
  }

  @Patch('projects/:id/status')
  @Roles('Faculty', 'LabAdmin', 'Wrangler', 'IQAC', 'Dean', 'SuperAdmin')
  status(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: { status: string; ip_agreement_id?: string },
  ) {
    return this.moonshots.updateStatus(
      this.tenant(req),
      id,
      body.status,
      body.ip_agreement_id,
    );
  }
}
