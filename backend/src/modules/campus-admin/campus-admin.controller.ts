import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CampusAdminService } from './campus-admin.service';
import type { ScopedAuthUser } from '../../common/campus-scope/campus-scope.service';
import { CampusHierarchyAssignmentDto } from './dto/campus-hierarchy-assignment.dto';
import {
  CreateCampusCourseDto,
  CreateCampusProgramDto,
  UpdateCampusCourseDto,
  UpdateCampusProgramDto,
} from './dto/campus-program-course.dto';
import {
  CreateCampusUserDto,
  UpdateCampusUserDto,
} from './dto/campus-user.dto';
import { UpdateCampusRolePermissionsDto } from './dto/campus-role-permissions.dto';
import { UpdateCampusProfileDto } from './dto/campus-profile.dto';
import {
  CreateDepartmentDto,
  UpdateDepartmentDto,
} from '../admin-control/dto/admin-control.dto';

@Controller('api/campus-admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CampusAdmin')
export class CampusAdminController {
  constructor(private readonly campusAdmin: CampusAdminService) {}

  @Get('dashboard')
  dashboard(@Req() req: { user: ScopedAuthUser }) {
    return this.campusAdmin.dashboard(req.user);
  }

  @Get('profile')
  profile(@Req() req: { user: ScopedAuthUser }) {
    return this.campusAdmin.profile(req.user);
  }

  @Patch('profile')
  updateProfile(
    @Req() req: { user: ScopedAuthUser },
    @Body() body: UpdateCampusProfileDto,
  ) {
    return this.campusAdmin.updateProfile(req.user, body);
  }

  @Get('departments')
  departments(
    @Req() req: { user: ScopedAuthUser },
    @Query('q') q?: string,
    @Query('status') status?: 'active' | 'inactive' | 'all',
    @Query('school_id') schoolId?: string,
  ) {
    return this.campusAdmin.departments(req.user, undefined, {
      q,
      status:
        status === 'inactive' || status === 'all' || status === 'active'
          ? status
          : 'active',
      school_id:
        schoolId && Number.isInteger(Number(schoolId))
          ? Number(schoolId)
          : undefined,
    });
  }

  @Get('departments/lookups')
  departmentLookups(@Req() req: { user: ScopedAuthUser }) {
    return this.campusAdmin.departmentLookups(req.user);
  }

  @Get('departments/hod-candidates')
  departmentHodCandidates(
    @Req() req: { user: ScopedAuthUser },
    @Query('q') q?: string,
    @Query('dept_id') deptId?: string,
  ) {
    return this.campusAdmin.departmentHodCandidates(
      req.user,
      q,
      deptId && Number.isInteger(Number(deptId)) ? Number(deptId) : undefined,
    );
  }

  @Post('departments')
  createDepartment(
    @Req() req: { user: ScopedAuthUser },
    @Body() body: CreateDepartmentDto,
  ) {
    return this.campusAdmin.createDepartment(req.user, body);
  }

  @Get('departments/:deptId')
  departmentDetail(
    @Req() req: { user: ScopedAuthUser },
    @Param('deptId') deptId: string,
  ) {
    return this.campusAdmin.departmentDetail(req.user, Number(deptId));
  }

  @Patch('departments/:deptId')
  updateDepartment(
    @Req() req: { user: ScopedAuthUser },
    @Param('deptId') deptId: string,
    @Body() body: UpdateDepartmentDto,
  ) {
    return this.campusAdmin.updateDepartment(req.user, Number(deptId), body);
  }

  @Delete('departments/:deptId')
  deactivateDepartment(
    @Req() req: { user: ScopedAuthUser },
    @Param('deptId') deptId: string,
  ) {
    return this.campusAdmin.deactivateDepartment(req.user, Number(deptId));
  }

  @Post('departments/:deptId/activate')
  activateDepartment(
    @Req() req: { user: ScopedAuthUser },
    @Param('deptId') deptId: string,
  ) {
    return this.campusAdmin.activateDepartment(req.user, Number(deptId));
  }

  @Get('programs')
  programs(
    @Req() req: { user: ScopedAuthUser },
    @Query('status') status?: 'active' | 'inactive' | 'all',
  ) {
    return this.campusAdmin.programs(
      req.user,
      undefined,
      status === 'inactive' || status === 'all' ? status : 'active',
    );
  }

  @Post('programs')
  createProgram(
    @Req() req: { user: ScopedAuthUser },
    @Body() body: CreateCampusProgramDto,
  ) {
    return this.campusAdmin.createProgram(req.user, body);
  }

  @Get('programs/:id')
  programDetail(
    @Req() req: { user: ScopedAuthUser },
    @Param('id') id: string,
  ) {
    return this.campusAdmin.programDetail(req.user, Number(id));
  }

  @Patch('programs/:id')
  updateProgram(
    @Req() req: { user: ScopedAuthUser },
    @Param('id') id: string,
    @Body() body: UpdateCampusProgramDto,
  ) {
    return this.campusAdmin.updateProgram(req.user, Number(id), body);
  }

  @Delete('programs/:id')
  deactivateProgram(
    @Req() req: { user: ScopedAuthUser },
    @Param('id') id: string,
  ) {
    return this.campusAdmin.deactivateProgram(req.user, Number(id));
  }

  @Post('programs/:id/restore')
  restoreProgram(
    @Req() req: { user: ScopedAuthUser },
    @Param('id') id: string,
  ) {
    return this.campusAdmin.restoreProgram(req.user, Number(id));
  }

  @Get('courses')
  courses(
    @Req() req: { user: ScopedAuthUser },
    @Query('status') status?: 'active' | 'inactive' | 'all',
  ) {
    return this.campusAdmin.courses(
      req.user,
      undefined,
      status === 'inactive' || status === 'all' ? status : 'active',
    );
  }

  @Post('courses')
  createCourse(
    @Req() req: { user: ScopedAuthUser },
    @Body() body: CreateCampusCourseDto,
  ) {
    return this.campusAdmin.createCourse(req.user, body);
  }

  @Get('courses/:id')
  courseDetail(
    @Req() req: { user: ScopedAuthUser },
    @Param('id') id: string,
  ) {
    return this.campusAdmin.courseDetail(req.user, id);
  }

  @Patch('courses/:id')
  updateCourse(
    @Req() req: { user: ScopedAuthUser },
    @Param('id') id: string,
    @Body() body: UpdateCampusCourseDto,
  ) {
    return this.campusAdmin.updateCourse(req.user, id, body);
  }

  @Delete('courses/:id')
  deactivateCourse(
    @Req() req: { user: ScopedAuthUser },
    @Param('id') id: string,
  ) {
    return this.campusAdmin.deactivateCourse(req.user, id);
  }

  @Post('courses/:id/restore')
  restoreCourse(
    @Req() req: { user: ScopedAuthUser },
    @Param('id') id: string,
  ) {
    return this.campusAdmin.restoreCourse(req.user, id);
  }

  @Get('faculty-staff')
  facultyStaff(
    @Req() req: { user: ScopedAuthUser },
    @Query('role') role?: string,
  ) {
    return this.campusAdmin.facultyStaff(req.user, undefined, role);
  }

  @Get('faculty-staff/:userId')
  facultyStaffDetail(
    @Req() req: { user: ScopedAuthUser },
    @Param('userId') userId: string,
  ) {
    return this.campusAdmin.facultyStaffDetail(req.user, userId);
  }

  @Get('students')
  students(@Req() req: { user: ScopedAuthUser }) {
    return this.campusAdmin.students(req.user);
  }

  @Get('students/:userId')
  studentsDetail(
    @Req() req: { user: ScopedAuthUser },
    @Param('userId') userId: string,
  ) {
    return this.campusAdmin.studentsDetail(req.user, userId);
  }

  @Get('users')
  listUsers(
    @Req() req: { user: ScopedAuthUser },
    @Query('q') q?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.campusAdmin.listManagedUsers(req.user, {
      q,
      role,
      status,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }

  @Get('users/roles')
  listUserRoles(@Req() req: { user: ScopedAuthUser }) {
    return this.campusAdmin.listAssignableRoles(req.user);
  }

  @Get('users/:userId')
  getUser(
    @Req() req: { user: ScopedAuthUser },
    @Param('userId') userId: string,
  ) {
    return this.campusAdmin.getManagedUser(req.user, userId);
  }

  @Post('users')
  createUser(
    @Req() req: { user: ScopedAuthUser },
    @Body() body: CreateCampusUserDto,
  ) {
    return this.campusAdmin.createManagedUser(req.user, body);
  }

  @Patch('users/:userId')
  updateUser(
    @Req() req: { user: ScopedAuthUser },
    @Param('userId') userId: string,
    @Body() body: UpdateCampusUserDto,
  ) {
    return this.campusAdmin.updateManagedUser(req.user, userId, body);
  }

  @Post('users/:userId/activate')
  activateUser(
    @Req() req: { user: ScopedAuthUser },
    @Param('userId') userId: string,
  ) {
    return this.campusAdmin.activateManagedUser(req.user, userId);
  }

  @Post('users/:userId/deactivate')
  deactivateUser(
    @Req() req: { user: ScopedAuthUser },
    @Param('userId') userId: string,
  ) {
    return this.campusAdmin.deactivateManagedUser(req.user, userId);
  }

  @Get('roles-permissions')
  listRolePermissions(
    @Req() req: { user: ScopedAuthUser },
    @Query('q') q?: string,
  ) {
    return this.campusAdmin.listRolePermissions(req.user, q);
  }

  @Put('roles-permissions/:roleName')
  updateRolePermissions(
    @Req() req: { user: ScopedAuthUser },
    @Param('roleName') roleName: string,
    @Body() body: UpdateCampusRolePermissionsDto,
  ) {
    return this.campusAdmin.updateRolePermissions(req.user, roleName, body);
  }

  @Get('applications')
  applications(@Req() req: { user: ScopedAuthUser }) {
    return this.campusAdmin.applications(req.user);
  }

  @Get('applications/:applicationId')
  applicationsDetail(
    @Req() req: { user: ScopedAuthUser },
    @Param('applicationId') applicationId: string,
  ) {
    return this.campusAdmin.applicationsDetail(req.user, applicationId);
  }

  @Get('classrooms')
  classrooms(@Req() req: { user: ScopedAuthUser }) {
    return this.campusAdmin.classrooms(req.user);
  }

  @Get('classrooms/:id')
  classroomDetail(
    @Req() req: { user: ScopedAuthUser },
    @Param('id') id: string,
  ) {
    return this.campusAdmin.classroomDetail(req.user, id);
  }

  @Get('facilities')
  facilities(@Req() req: { user: ScopedAuthUser }) {
    return this.campusAdmin.classrooms(req.user);
  }

  @Get('facilities/:id')
  facilityDetail(
    @Req() req: { user: ScopedAuthUser },
    @Param('id') id: string,
  ) {
    return this.campusAdmin.classroomDetail(req.user, id);
  }

  @Get('requests/assignable-users')
  requestAssignableUsers(
    @Req() req: { user: ScopedAuthUser },
    @Query('q') q?: string,
  ) {
    return this.campusAdmin.requestAssignableUsers(req.user, q);
  }

  @Get('requests/:ticketId')
  requestDetail(
    @Req() req: { user: ScopedAuthUser },
    @Param('ticketId') ticketId: string,
  ) {
    return this.campusAdmin.requestDetail(req.user, ticketId);
  }

  @Get('requests')
  requests(
    @Req() req: { user: ScopedAuthUser },
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('q') q?: string,
    @Query('assigned') assigned?: 'assigned' | 'unassigned' | 'me',
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.campusAdmin.requests(req.user, {
      status,
      category,
      q,
      assigned,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get('reports')
  reports(
    @Req() req: { user: ScopedAuthUser },
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('academic_year') academicYear?: string,
    @Query('dept_id') deptId?: string,
    @Query('program_id') programId?: string,
  ) {
    return this.campusAdmin.campusReports(req.user, {
      from,
      to,
      academic_year: academicYear,
      dept_id: deptId ? Number(deptId) : undefined,
      program_id: programId ? Number(programId) : undefined,
    });
  }

  @Get('analytics')
  analytics(@Req() req: { user: ScopedAuthUser }) {
    return this.campusAdmin.analytics(req.user);
  }

  @Get('hierarchy')
  hierarchy(@Req() req: { user: ScopedAuthUser }) {
    return this.campusAdmin.hierarchy(req.user);
  }

  @Get('hierarchy/assignable-users')
  hierarchyAssignableUsers(
    @Req() req: { user: ScopedAuthUser },
    @Query('q') q?: string,
  ) {
    return this.campusAdmin.hierarchyAssignableUsers(req.user, q);
  }

  @Get('hierarchy/assignments')
  listHierarchyAssignments(@Req() req: { user: ScopedAuthUser }) {
    return this.campusAdmin.listHierarchyAssignments(req.user);
  }

  @Post('hierarchy/assignments')
  assignHierarchy(
    @Req() req: { user: ScopedAuthUser },
    @Body() dto: CampusHierarchyAssignmentDto,
  ) {
    return this.campusAdmin.assignHierarchy(req.user, dto);
  }

  @Delete('hierarchy/assignments/:assignmentId')
  revokeHierarchyAssignment(
    @Req() req: { user: ScopedAuthUser },
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.campusAdmin.revokeHierarchyAssignment(req.user, assignmentId);
  }
}
