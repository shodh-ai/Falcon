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
import { AttendancePolicyService } from './attendance-policy.service';

type AuthUser = { user_id: string; tenant_id?: string; role?: string };

interface DecisionBody {
  decision?: 'APPROVE' | 'REJECT';
  remarks?: string;
}

@Controller('api/attendance-policy')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendancePolicyController {
  constructor(private readonly policy: AttendancePolicyService) {}

  // --- Student: individual exemption requests ---

  @Post('exemptions')
  @Roles('Student', 'SuperAdmin')
  createExemption(
    @Req() req: { user: AuthUser },
    @Body()
    dto: {
      reason_category?: string;
      description?: string;
      supporting_doc_url?: string;
      semester?: number;
    },
  ) {
    return this.policy.createExemption(this.tenant(req), req.user.user_id, dto);
  }

  @Get('exemptions/mine')
  @Roles('Student', 'SuperAdmin')
  myExemptions(@Req() req: { user: AuthUser }) {
    return this.policy.listMyExemptions(this.tenant(req), req.user.user_id);
  }

  // --- HOD: recommend / reject exemptions, request threshold change ---

  @Get('hod/exemptions')
  @Roles('HOD', 'SuperAdmin')
  hodExemptions(@Req() req: { user: AuthUser }) {
    return this.policy.listHodExemptions(this.tenant(req), req.user.user_id);
  }

  @Post('hod/exemptions/:id/decision')
  @Roles('HOD', 'SuperAdmin')
  hodDecideExemption(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: DecisionBody,
  ) {
    return this.policy.hodDecideExemption(
      this.tenant(req),
      req.user.user_id,
      id,
      dto,
    );
  }

  @Get('hod/threshold-requests')
  @Roles('HOD', 'SuperAdmin')
  myThresholdRequests(@Req() req: { user: AuthUser }) {
    return this.policy.listMyThresholdRequests(
      this.tenant(req),
      req.user.user_id,
    );
  }

  @Post('hod/threshold-requests')
  @Roles('HOD', 'SuperAdmin')
  createThresholdRequest(
    @Req() req: { user: AuthUser },
    @Body()
    dto: {
      dept_id?: number | null;
      requested_min_percent?: number;
      reason?: string;
    },
  ) {
    return this.policy.createThresholdRequest(
      this.tenant(req),
      req.user.user_id,
      dto,
    );
  }

  @Post('hod/department-threshold')
  @Roles('HOD', 'SuperAdmin')
  setDepartmentThresholdDirect(
    @Req() req: { user: AuthUser },
    @Body()
    dto: {
      requested_min_percent?: number;
      reason?: string;
    },
  ) {
    return this.policy.setDepartmentThresholdDirect(
      this.tenant(req),
      req.user.user_id,
      {
        requested_min_percent: Number(dto.requested_min_percent),
        reason: dto.reason,
      },
    );
  }

  @Get('hod/courses')
  @Roles('HOD', 'SuperAdmin')
  listCourses(@Req() req: { user: AuthUser }) {
    return this.policy.listCourses(this.tenant(req), req.user.user_id);
  }

  @Post('hod/courses/:courseId/threshold')
  @Roles('HOD', 'SuperAdmin')
  updateCourseThreshold(
    @Req() req: { user: AuthUser },
    @Param('courseId') courseId: string,
    @Body()
    dto: {
      min_attendance?: number | null;
    },
  ) {
    const val =
      dto.min_attendance !== undefined && dto.min_attendance !== null
        ? Number(dto.min_attendance)
        : null;
    return this.policy.updateCourseThreshold(
      this.tenant(req),
      courseId,
      val,
      req.user.user_id,
    );
  }

  // --- Dean: decide threshold changes ---

  @Get('dean/threshold-requests')
  @Roles('Dean', 'SuperAdmin')
  pendingThresholdRequests(@Req() req: { user: AuthUser }) {
    return this.policy.listDeanPendingThresholdRequests(
      this.tenant(req),
      req.user.user_id,
      req.user.role,
    );
  }

  @Post('dean/threshold-requests/:id/decision')
  @Roles('Dean', 'SuperAdmin')
  decideThresholdRequest(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: DecisionBody,
  ) {
    return this.policy.decideThresholdRequest(
      this.tenant(req),
      req.user.user_id,
      id,
      dto,
      req.user.role,
    );
  }

  // --- Exam Cell: HOD-approved exemptions (admit card may now be generated) ---

  @Get('approved/exemptions')
  @Roles('ExamCell', 'SuperAdmin')
  approvedExemptions(@Req() req: { user: AuthUser }) {
    return this.policy.listApprovedExemptions(this.tenant(req));
  }

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }
}
