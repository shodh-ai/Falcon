import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StudentSafetyService } from './student-safety.service';

type AuthUser = {
  user_id: string;
  tenant_id?: string;
  role?: string;
  primaryRole?: string;
};

@Controller('api/student-safety')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StudentSafetyController {
  constructor(private readonly safety: StudentSafetyService) {}

  @Post('concerns')
  @Roles('Student', 'SuperAdmin')
  createConcern(
    @Req() req: { user: AuthUser },
    @Body()
    dto: {
      concern_type?: string;
      accused_type?: string;
      accused_user_id?: string | null;
      accused_description?: string;
      incident_description?: string;
      incident_location?: string;
      incident_date?: string;
      is_hostel_related?: boolean;
      evidence_urls?: string[];
    },
  ) {
    return this.safety.createConcern(this.tenant(req), req.user.user_id, dto);
  }

  @Get('concerns/mine')
  @Roles('Student', 'SuperAdmin')
  myConcerns(@Req() req: { user: AuthUser }) {
    return this.safety.listMyConcerns(this.tenant(req), req.user.user_id);
  }

  @Get('accused-options')
  @Roles('Student', 'SuperAdmin')
  accusedOptions(@Req() req: { user: AuthUser }, @Query('type') type: string) {
    return this.safety.listAccusedOptions(this.tenant(req), type ?? '');
  }

  @Get('dc/concerns')
  @Roles('DC_MEMBER', 'SuperAdmin')
  dcConcerns(@Req() req: { user: AuthUser }) {
    return this.safety.listForRole(
      this.tenant(req),
      'DC_MEMBER',
      req.user.user_id,
    );
  }

  @Get('hod/concerns')
  @Roles('HOD', 'SuperAdmin')
  hodConcerns(@Req() req: { user: AuthUser }) {
    return this.safety.listForRole(this.tenant(req), 'HOD', req.user.user_id);
  }

  @Get('dean/concerns')
  @Roles('Dean', 'SuperAdmin')
  deanConcerns(@Req() req: { user: AuthUser }) {
    return this.safety.listForRole(this.tenant(req), 'Dean', req.user.user_id);
  }

  @Get('hr/concerns')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  hrConcerns(@Req() req: { user: AuthUser }) {
    return this.safety.listForRole(this.tenant(req), 'HR', req.user.user_id);
  }

  @Get('warden/concerns')
  @Roles('Warden', 'SuperAdmin')
  wardenConcerns(@Req() req: { user: AuthUser }) {
    return this.safety.listForRole(
      this.tenant(req),
      'Warden',
      req.user.user_id,
    );
  }

  @Get('faculty/notices')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  facultyNotices(@Req() req: { user: AuthUser }) {
    return this.safety.listFacultyNotices(this.tenant(req), req.user.user_id);
  }

  @Patch('concerns/:id')
  @Roles('DC_MEMBER', 'HOD', 'Dean', 'HR', 'HRAdmin', 'Warden', 'SuperAdmin')
  updateConcern(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body()
    dto: {
      status?: 'UNDER_REVIEW' | 'ESCALATED' | 'RESOLVED' | 'CLOSED';
      remarks?: string;
      resolution_summary?: string;
    },
  ) {
    const role = req.user.primaryRole ?? req.user.role ?? 'SuperAdmin';
    return this.safety.updateConcern(
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
