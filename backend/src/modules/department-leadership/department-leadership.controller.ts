import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UseGuards,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { IsEmail, IsIn, IsOptional, IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ScopedAuthUser } from '../../common/campus-scope/campus-scope.service';
import { BelongsToModule } from '../../module-control/module-control.decorators';
import { DepartmentLeadershipService } from './department-leadership.service';
import {
  DepartmentStructure,
  OfficeKind,
  STRUCTURES,
} from './leadership.types';
import { DataSource } from 'typeorm';

class StructureDto {
  @IsIn(STRUCTURES) structure: DepartmentStructure;
  @IsOptional() @IsUUID() higher_officer_id?: string | null;
}
class AppointmentDto {
  @IsIn(['PRINCIPAL', 'HOD']) kind: OfficeKind;
  @IsEmail() login_alias: string;
  @IsOptional() @IsUUID() user_id: string | null;
}
class FlexibleLeadershipDto {
  @IsOptional() @IsUUID() hod_user_id: string | null;
  @IsOptional() @IsUUID() principal_user_id: string | null;
  @IsOptional() @IsUUID() dean_user_id: string | null;
  @IsOptional() @IsUUID() higher_officer_id: string | null;
}
function revision(value?: string) {
  if (!value || !/^"?\d+"?$/.test(value))
    throw new BadRequestException(
      'If-Match with the current numeric revision is required',
    );
  return Number(value.replace(/"/g, ''));
}
@Controller('api/campus-admin/department-leadership')
@BelongsToModule('CORE')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CampusAdmin', 'SuperAdmin')
export class DepartmentLeadershipController {
  constructor(private readonly leadership: DepartmentLeadershipService) {}
  @Get(':deptId') read(
    @Req() req: { user: ScopedAuthUser },
    @Param('deptId', ParseIntPipe) deptId: number,
  ) {
    return this.leadership.read(req.user, deptId);
  }
  @Get(':deptId/preview') preview(
    @Req() req: { user: ScopedAuthUser },
    @Param('deptId', ParseIntPipe) deptId: number,
  ) {
    return this.leadership.previewFlexible(req.user, deptId);
  }
  @Put(':deptId/flexible') saveFlexible(
    @Req() req: { user: ScopedAuthUser },
    @Param('deptId', ParseIntPipe) deptId: number,
    @Body() body: FlexibleLeadershipDto,
    @Headers('if-match') match: string,
    @Headers('idempotency-key') key: string,
  ) {
    return this.leadership.configureFlexible(req.user, deptId, body, revision(match), key);
  }
  @Put(':deptId') configure(
    @Req() req: { user: ScopedAuthUser },
    @Param('deptId', ParseIntPipe) deptId: number,
    @Body() body: StructureDto,
    @Headers('if-match') match: string,
  ) {
    return this.leadership.configure(req.user, deptId, body, revision(match));
  }
  @Post(':deptId/appointments') appoint(
    @Req() req: { user: ScopedAuthUser },
    @Param('deptId', ParseIntPipe) deptId: number,
    @Body() body: AppointmentDto,
    @Headers('if-match') match: string,
  ) {
    if (!Object.prototype.hasOwnProperty.call(body, 'user_id'))
      throw new BadRequestException(
        'user_id is required; use null explicitly to end an appointment',
      );
    return this.leadership.appoint(
      req.user,
      deptId,
      body.kind,
      body.login_alias,
      body.user_id,
      revision(match),
    );
  }
}

@Controller('api/academics/principal')
@BelongsToModule('sis_academics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Principal')
export class PrincipalWorkspaceController {
  constructor(
    private readonly leadership: DepartmentLeadershipService,
    private readonly db: DataSource,
  ) {}
  @Get('offices') async offices(@Req() req: { user: ScopedAuthUser }) {
    const user = req.user;
    if (!user.tenant_id || !user.user_id) throw new ForbiddenException();
    const context = await this.leadership.context(user.tenant_id, user.user_id);
    const ids = context.offices.filter((office) => office.kind === 'PRINCIPAL')
      .map((office) => office.dept_id);
    if (!ids.length) return [];
    return this.db.query(`SELECT d.dept_id,d.dept_name,s.school_name,
      hod.name AS hod_name,
      (SELECT count(*)::int FROM users staff WHERE staff.tenant_id=$2
        AND staff.dept_id=d.dept_id AND staff.is_active=true AND staff.deleted_at IS NULL
        AND NOT EXISTS(SELECT 1 FROM student_profiles sp
          WHERE sp.tenant_id=staff.tenant_id AND sp.user_id=staff.user_id)) AS staff_count
      FROM departments d JOIN schools s ON s.school_id=d.school_id
      LEFT JOIN department_offices ho ON ho.tenant_id=$2 AND ho.dept_id=d.dept_id AND ho.kind='HOD'
      LEFT JOIN department_office_appointments ha ON ha.office_id=ho.office_id AND ha.valid_to IS NULL
      LEFT JOIN users hod ON hod.user_id=ha.user_id AND hod.tenant_id=$2
      WHERE d.dept_id=ANY($1::int[]) AND d.deleted_at IS NULL
      ORDER BY s.school_name,d.dept_name`, [ids, user.tenant_id]);
  }
  @Get('overview') async overview(
    @Req() req: { user: ScopedAuthUser },
    @Headers('x-department-id') selected?: string,
  ) {
    const user = req.user;
    if (!user.tenant_id || !user.user_id) throw new ForbiddenException();
    const { offices } = await this.leadership.context(
      user.tenant_id,
      user.user_id,
    );
    const office = offices.find(
      (o) =>
        o.kind === 'PRINCIPAL' && (!selected || o.dept_id === Number(selected)),
    );
    if (!office)
      throw new ForbiddenException(
        'No active Principal appointment in this department',
      );
    const args = [user.tenant_id, office.dept_id];
    const staff = await this.db.query(
      `SELECT u.user_id,u.name,u.official_email FROM users u WHERE u.tenant_id=$1 AND u.dept_id=$2 AND u.is_active=true AND u.deleted_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM student_profiles sp WHERE sp.user_id=u.user_id AND sp.tenant_id=u.tenant_id) ORDER BY u.name`,
      args,
    );
    const students = await this.db.query(
      `SELECT u.user_id,u.name,sp.student_login_id,sp.enrollment_no FROM users u
      JOIN student_profiles sp ON sp.user_id=u.user_id AND sp.tenant_id=u.tenant_id
      WHERE u.tenant_id=$1 AND u.dept_id=$2 AND u.is_active=true AND u.deleted_at IS NULL AND sp.deleted_at IS NULL ORDER BY u.name`,
      args,
    );
    const courses = await this.db.query(
      `SELECT DISTINCT c.course_id,c.course_code,c.course_name FROM academic_courses c
      JOIN academic_course_allocations a ON a.course_id=c.course_id AND a.tenant_id=c.tenant_id
      JOIN users u ON u.user_id=a.faculty_user_id AND u.tenant_id=a.tenant_id
      WHERE c.tenant_id=$1 AND u.dept_id=$2 AND c.deleted_at IS NULL AND a.status='ACTIVE' ORDER BY c.course_code`,
      args,
    );
    return { office, staff, students, courses };
  }
}

@Controller('api/academics/dean/leadership')
@BelongsToModule('sis_academics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Dean')
export class DeanLeadershipWorkspaceController {
  constructor(private readonly db: DataSource) {}

  @Get('departments')
  assignedDepartments(@Req() req: { user: ScopedAuthUser }) {
    const { tenant_id: tenantId, user_id: userId } = req.user;
    if (!tenantId || !userId) throw new ForbiddenException();
    return this.db.query(`SELECT c.dept_id,d.dept_name,s.school_name,
      hod.name AS hod_name,principal.name AS principal_name,
      c.revision
      FROM department_leadership c
      JOIN departments d ON d.dept_id=c.dept_id AND d.deleted_at IS NULL
      JOIN schools s ON s.school_id=d.school_id
      LEFT JOIN department_offices ho ON ho.tenant_id=c.tenant_id
        AND ho.dept_id=c.dept_id AND ho.kind='HOD'
      LEFT JOIN department_office_appointments ha ON ha.office_id=ho.office_id
        AND ha.valid_to IS NULL
      LEFT JOIN users hod ON hod.user_id=ha.user_id AND hod.tenant_id=c.tenant_id
      LEFT JOIN department_offices po ON po.tenant_id=c.tenant_id
        AND po.dept_id=c.dept_id AND po.kind='PRINCIPAL'
      LEFT JOIN department_office_appointments pa ON pa.office_id=po.office_id
        AND pa.valid_to IS NULL
      LEFT JOIN users principal ON principal.user_id=pa.user_id AND principal.tenant_id=c.tenant_id
      WHERE c.tenant_id=$1 AND c.dean_enabled=true AND c.dean_user_id=$2
      ORDER BY s.school_name,d.dept_name`, [tenantId, userId]);
  }
}
