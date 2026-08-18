import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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

  @Get('departments')
  departments(@Req() req: { user: ScopedAuthUser }) {
    return this.campusAdmin.departments(req.user);
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
  facultyStaff(@Req() req: { user: ScopedAuthUser }) {
    return this.campusAdmin.facultyStaff(req.user);
  }

  @Get('students')
  students(@Req() req: { user: ScopedAuthUser }) {
    return this.campusAdmin.students(req.user);
  }

  @Get('applications')
  applications(@Req() req: { user: ScopedAuthUser }) {
    return this.campusAdmin.applications(req.user);
  }

  @Get('classrooms')
  classrooms(@Req() req: { user: ScopedAuthUser }) {
    return this.campusAdmin.classrooms(req.user);
  }

  @Get('facilities')
  facilities(@Req() req: { user: ScopedAuthUser }) {
    return this.campusAdmin.classrooms(req.user);
  }

  @Get('requests')
  requests(@Req() req: { user: ScopedAuthUser }) {
    return this.campusAdmin.requests(req.user);
  }

  @Get('reports')
  reports(@Req() req: { user: ScopedAuthUser }) {
    return this.campusAdmin.reports(req.user);
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
