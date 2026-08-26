import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { normalizeRoleName } from '../../common/config/campus-admin.roles';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminControlService } from './admin-control.service';
import {
  AiAssistDto,
  AnnouncementDto,
  AssignHodDto,
  BroadcastNotificationDto,
  BulkImportUsersDto,
  CalendarEventDto,
  CreateAdminUserDto,
  CreateCourseDto,
  CreateDepartmentDto,
  FeeStructureDto,
  NamedEntityDto,
  PortalAccessDto,
  PromoteStudentDto,
  ReportExportDto,
  ResetPasswordDto,
  RolePermissionsDto,
  SystemSettingsDto,
  UpdateAdminUserDto,
  UpdateCourseDto,
  UpdateDepartmentDto,
} from './dto/admin-control.dto';

type AuthUser = {
  user_id: string;
  tenant_id?: string;
  role?: string;
  roles?: string[];
};

@Controller('api/admin-control')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SuperAdmin', 'Registrar')
export class AdminControlController {
  constructor(private readonly admin: AdminControlService) {}

  private tenant(req: { user: AuthUser }) {
    if (!req.user.tenant_id) {
      throw new BadRequestException('Tenant context required');
    }
    return req.user.tenant_id;
  }

  private isPureCampusAdmin(user: AuthUser) {
    const roles = Array.from(
      new Set([
        ...(Array.isArray(user.roles) ? user.roles : []),
        ...(user.role ? [user.role] : []),
      ]),
    ).map(normalizeRoleName);
    return (
      roles.includes('campusadmin') &&
      !roles.includes('registrar') &&
      !roles.includes('superadmin')
    );
  }

  private denyPureCampusAdmin(user: AuthUser, area: string) {
    if (this.isPureCampusAdmin(user)) {
      throw new ForbiddenException(
        `Campus Admin is not allowed to access university-wide Admin Control ${area}`,
      );
    }
  }

  @Get('dashboard')
  dashboard(@Req() req: { user: AuthUser }) {
    this.denyPureCampusAdmin(req.user, 'dashboard');
    return this.admin.getDashboard(this.tenant(req));
  }

  @Get('users')
  users(
    @Req() req: { user: AuthUser },
    @Query('q') q?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.denyPureCampusAdmin(req.user, 'user management');
    return this.admin.listUsers(this.tenant(req), {
      q,
      role,
      status,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }

  @Get('users/export')
  async exportUsers(
    @Req() req: { user: AuthUser },
    @Res() res: Response,
    @Query('role') role?: string,
  ) {
    this.denyPureCampusAdmin(req.user, 'user management');
    const file = await this.admin.exportUsers(this.tenant(req), role);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    return res.send(file.body);
  }

  @Post('users/import')
  importUsers(
    @Req() req: { user: AuthUser },
    @Body() body: BulkImportUsersDto,
  ) {
    this.denyPureCampusAdmin(req.user, 'user management');
    return this.admin.importUsers(
      this.tenant(req),
      req.user.user_id,
      body,
    );
  }

  @Post('users')
  createUser(@Req() req: { user: AuthUser }, @Body() body: CreateAdminUserDto) {
    this.denyPureCampusAdmin(req.user, 'user management');
    return this.admin.createUser(this.tenant(req), req.user.user_id, body);
  }

  @Patch('users/:id')
  updateUser(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: UpdateAdminUserDto,
  ) {
    this.denyPureCampusAdmin(req.user, 'user management');
    return this.admin.updateUser(
      this.tenant(req),
      req.user.user_id,
      id,
      body,
    );
  }

  @Delete('users/:id')
  deleteUser(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    this.denyPureCampusAdmin(req.user, 'user management');
    return this.admin.deleteUser(this.tenant(req), req.user.user_id, id);
  }

  @Post('users/:id/suspend')
  suspend(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    this.denyPureCampusAdmin(req.user, 'user management');
    return this.admin.suspendUser(
      this.tenant(req),
      req.user.user_id,
      id,
    );
  }

  @Post('users/:id/deactivate')
  deactivate(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    this.denyPureCampusAdmin(req.user, 'user management');
    return this.admin.deactivateUser(
      this.tenant(req),
      req.user.user_id,
      id,
    );
  }

  @Post('users/:id/activate')
  activate(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    this.denyPureCampusAdmin(req.user, 'user management');
    return this.admin.activateUser(
      this.tenant(req),
      req.user.user_id,
      id,
    );
  }

  @Post('users/:id/reset-password')
  resetPassword(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: ResetPasswordDto,
  ) {
    this.denyPureCampusAdmin(req.user, 'user management');
    return this.admin.resetPassword(
      this.tenant(req),
      req.user.user_id,
      id,
      body,
    );
  }

  @Get('roles')
  roles(@Req() req: { user: AuthUser }) {
    this.denyPureCampusAdmin(req.user, 'roles & permissions');
    return this.admin.listRoles(this.tenant(req));
  }

  @Put('roles/:role/permissions')
  @Roles('SuperAdmin', 'Registrar')
  updateRole(
    @Req() req: { user: AuthUser },
    @Param('role') role: string,
    @Body() body: RolePermissionsDto,
  ) {
    this.denyPureCampusAdmin(req.user, 'roles & permissions');
    return this.admin.updateRolePermissions(
      this.tenant(req),
      req.user.user_id,
      role,
      body,
    );
  }

  @Get('departments')
  departments(
    @Req() req: { user: AuthUser },
    @Query('q') q?: string,
    @Query('campus_id') campusId?: string,
    @Query('school_id') schoolId?: string,
    @Query('status') status?: 'active' | 'inactive' | 'all',
  ) {
    this.denyPureCampusAdmin(req.user, 'department management');
    return this.admin.listDepartments(req.user, {
      q,
      campus_id:
        campusId && Number.isInteger(Number(campusId))
          ? Number(campusId)
          : undefined,
      school_id:
        schoolId && Number.isInteger(Number(schoolId))
          ? Number(schoolId)
          : undefined,
      status:
        status === 'inactive' || status === 'all' || status === 'active'
          ? status
          : 'active',
    });
  }

  @Get('departments/lookups')
  departmentLookups(@Req() req: { user: AuthUser }) {
    this.denyPureCampusAdmin(req.user, 'department management');
    return this.admin.listDepartmentLookups(req.user);
  }

  @Get('hod/candidates')
  hodCandidates(
    @Req() req: { user: AuthUser },
    @Query('q') q?: string,
    @Query('dept_id') deptId?: string,
  ) {
    this.denyPureCampusAdmin(req.user, 'department management');
    return this.admin.listHodCandidates(
      req.user,
      this.tenant(req),
      q,
      deptId && Number.isInteger(Number(deptId)) ? Number(deptId) : undefined,
    );
  }

  @Get('departments/:id')
  department(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    this.denyPureCampusAdmin(req.user, 'department management');
    return this.admin.getDepartment(req.user, this.tenant(req), Number(id));
  }

  @Get('structure')
  structure(@Req() req: { user: AuthUser }) {
    this.denyPureCampusAdmin(req.user, 'university structure');
    return this.admin.listStructure();
  }

  @Post('departments')
  createDept(
    @Req() req: { user: AuthUser },
    @Body() body: CreateDepartmentDto,
  ) {
    this.denyPureCampusAdmin(req.user, 'department management');
    return this.admin.createDepartment(this.tenant(req), req.user, body);
  }

  @Patch('departments/:id')
  updateDept(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: UpdateDepartmentDto,
  ) {
    this.denyPureCampusAdmin(req.user, 'department management');
    return this.admin.updateDepartment(
      this.tenant(req),
      req.user,
      Number(id),
      body,
    );
  }

  @Delete('departments/:id')
  deleteDept(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    this.denyPureCampusAdmin(req.user, 'department management');
    return this.admin.deleteDepartment(this.tenant(req), req.user, Number(id));
  }

  @Post('departments/:id/restore')
  restoreDept(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    this.denyPureCampusAdmin(req.user, 'department management');
    return this.admin.restoreDepartment(this.tenant(req), req.user, Number(id));
  }

  @Get('courses')
  courses(@Req() req: { user: AuthUser }) {
    this.denyPureCampusAdmin(req.user, 'course management');
    return this.admin.listCourses(this.tenant(req));
  }

  @Post('courses')
  createCourse(@Req() req: { user: AuthUser }, @Body() body: CreateCourseDto) {
    this.denyPureCampusAdmin(req.user, 'course management');
    return this.admin.createCourse(this.tenant(req), req.user.user_id, body);
  }

  @Patch('courses/:id')
  updateCourse(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: UpdateCourseDto,
  ) {
    this.denyPureCampusAdmin(req.user, 'course management');
    return this.admin.updateCourse(
      this.tenant(req),
      req.user.user_id,
      id,
      body,
    );
  }

  @Delete('courses/:id')
  deleteCourse(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    this.denyPureCampusAdmin(req.user, 'course management');
    return this.admin.deleteCourse(this.tenant(req), req.user.user_id, id);
  }

  @Get('calendar')
  calendar(@Req() req: { user: AuthUser }) {
    this.denyPureCampusAdmin(req.user, 'calendar management');
    return this.admin.listCalendar(this.tenant(req));
  }

  @Post('calendar')
  createCalendar(
    @Req() req: { user: AuthUser },
    @Body() body: CalendarEventDto,
  ) {
    return this.admin.createCalendarEvent(
      this.tenant(req),
      req.user.user_id,
      body,
    );
  }

  @Delete('calendar/:id')
  deleteCalendar(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.admin.deleteCalendarEvent(
      this.tenant(req),
      req.user.user_id,
      id,
    );
  }

  @Post('notifications/broadcast')
  broadcast(
    @Req() req: { user: AuthUser },
    @Body() body: BroadcastNotificationDto,
  ) {
    this.denyPureCampusAdmin(req.user, 'tenant-wide notification broadcast');
    return this.admin.broadcastNotification(
      this.tenant(req),
      req.user.user_id,
      body,
    );
  }

  @Get('audit-logs')
  @Roles('SuperAdmin', 'Registrar')
  auditLogs(
    @Req() req: { user: AuthUser },
    @Query('q') q?: string,
    @Query('action') action?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    this.denyPureCampusAdmin(req.user, 'audit logs');
    return this.admin.listAuditLogs(this.tenant(req), {
      q,
      action,
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0,
    });
  }

  @Get('system/health')
  health(@Req() req: { user: AuthUser }) {
    this.denyPureCampusAdmin(req.user, 'system health');
    return this.admin.getSystemHealth(this.tenant(req));
  }

  @Post('backup/run')
  @Roles('SuperAdmin')
  runBackup(@Req() req: { user: AuthUser }) {
    return this.admin.runBackup(this.tenant(req), req.user.user_id);
  }

  @Get('backup/history')
  @Roles('SuperAdmin')
  backupHistory(@Req() req: { user: AuthUser }) {
    return this.admin.listBackups(this.tenant(req));
  }

  @Get('backup/:id/download')
  @Roles('SuperAdmin')
  async downloadBackup(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const file = await this.admin.downloadBackup(this.tenant(req), id);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    return res.send(file.body);
  }

  @Post('backup/:id/restore')
  @Roles('SuperAdmin')
  restore(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.admin.restoreBackup(this.tenant(req), req.user.user_id, id);
  }

  @Post('ai/assist')
  ai(@Req() req: { user: AuthUser }, @Body() body: AiAssistDto) {
    this.denyPureCampusAdmin(req.user, 'AI assist');
    return this.admin.aiAssist(this.tenant(req), req.user.user_id, body);
  }

  @Get('settings')
  @Roles('SuperAdmin')
  settings(@Req() req: { user: AuthUser }) {
    return this.admin.getSettings(this.tenant(req));
  }

  @Put('settings')
  @Roles('SuperAdmin')
  updateSettings(
    @Req() req: { user: AuthUser },
    @Body() body: SystemSettingsDto,
  ) {
    return this.admin.updateSettings(this.tenant(req), req.user.user_id, body);
  }

  @Get('reports/summary')
  reports(@Req() req: { user: AuthUser }) {
    this.denyPureCampusAdmin(req.user, 'university reports');
    return this.admin.reportSummary(this.tenant(req));
  }

  @Post('reports/export')
  async exportReport(
    @Req() req: { user: AuthUser },
    @Body() body: ReportExportDto,
    @Res() res: Response,
  ) {
    const file = await this.admin.exportReport(this.tenant(req), body);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    return res.send(file.body);
  }

  @Get('helpdesk/tickets')
  tickets(@Req() req: { user: AuthUser }) {
    this.denyPureCampusAdmin(req.user, 'university helpdesk');
    return this.admin.listHelpdeskTickets(this.tenant(req));
  }

  @Patch('helpdesk/tickets/:id')
  updateTicket(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: { status: string; assigned_to?: string },
  ) {
    if (!body?.status) throw new BadRequestException('status is required');
    return this.admin.updateTicketStatus(
      this.tenant(req),
      req.user.user_id,
      id,
      body.status,
      body.assigned_to,
    );
  }

  @Get('pending')
  pending(@Req() req: { user: AuthUser }) {
    this.denyPureCampusAdmin(req.user, 'university pending queue');
    return this.admin.pendingQueue(this.tenant(req));
  }

  @Get('academic/catalog')
  academicCatalog(@Req() req: { user: AuthUser }) {
    this.denyPureCampusAdmin(req.user, 'academic catalog');
    return this.admin.listAcademicCatalog(this.tenant(req));
  }

  @Post('academic/:kind')
  createAcademic(
    @Req() req: { user: AuthUser },
    @Param('kind') kind: string,
    @Body() body: NamedEntityDto,
  ) {
    return this.admin.createAcademicItem(
      this.tenant(req),
      req.user.user_id,
      kind,
      body,
    );
  }

  @Delete('academic/:kind/:id')
  deleteAcademic(
    @Req() req: { user: AuthUser },
    @Param('kind') kind: string,
    @Param('id') id: string,
  ) {
    return this.admin.deleteAcademicItem(
      this.tenant(req),
      req.user.user_id,
      kind,
      id,
    );
  }

  @Post('hod/assign')
  assignHod(@Req() req: { user: AuthUser }, @Body() body: AssignHodDto) {
    this.denyPureCampusAdmin(req.user, 'department management');
    return this.admin.assignHod(this.tenant(req), req.user, body);
  }

  @Post('hod/:deptId/remove')
  removeHod(@Req() req: { user: AuthUser }, @Param('deptId') deptId: string) {
    this.denyPureCampusAdmin(req.user, 'department management');
    return this.admin.removeHod(this.tenant(req), req.user, Number(deptId));
  }

  @Post('students/promote')
  promote(@Req() req: { user: AuthUser }, @Body() body: PromoteStudentDto) {
    this.denyPureCampusAdmin(req.user, 'student promotion');
    return this.admin.promoteStudent(this.tenant(req), req.user.user_id, body);
  }

  @Get('announcements')
  announcements(@Req() req: { user: AuthUser }) {
    this.denyPureCampusAdmin(req.user, 'communication');
    return this.admin.listAnnouncements(this.tenant(req));
  }

  @Post('announcements')
  createAnnouncement(
    @Req() req: { user: AuthUser },
    @Body() body: AnnouncementDto,
  ) {
    this.denyPureCampusAdmin(req.user, 'communication');
    return this.admin.createAnnouncement(
      this.tenant(req),
      req.user.user_id,
      body,
    );
  }

  @Get('fees')
  fees(@Req() req: { user: AuthUser }) {
    this.denyPureCampusAdmin(req.user, 'fees');
    return this.admin.listFeeStructures(this.tenant(req));
  }

  @Post('fees')
  createFee(@Req() req: { user: AuthUser }, @Body() body: FeeStructureDto) {
    return this.admin.createFeeStructure(
      this.tenant(req),
      req.user.user_id,
      body,
    );
  }

  @Get('portal-access')
  portalAccess(@Req() req: { user: AuthUser }) {
    this.denyPureCampusAdmin(req.user, 'portal access');
    return this.admin.listPortalAccess(this.tenant(req));
  }

  @Put('portal-access')
  @Roles('SuperAdmin')
  updatePortalAccess(
    @Req() req: { user: AuthUser },
    @Body() body: PortalAccessDto,
  ) {
    return this.admin.updatePortalAccess(
      this.tenant(req),
      req.user.user_id,
      body,
    );
  }

  @Get('login-history')
  loginHistory(@Req() req: { user: AuthUser }, @Query('limit') limit?: string) {
    this.denyPureCampusAdmin(req.user, 'login history');
    return this.admin.listLoginHistory(
      this.tenant(req),
      limit ? Number(limit) : 100,
    );
  }

  @Get('error-logs')
  errorLogs(@Req() req: { user: AuthUser }, @Query('limit') limit?: string) {
    this.denyPureCampusAdmin(req.user, 'error logs');
    return this.admin.listErrorLogs(
      this.tenant(req),
      limit ? Number(limit) : 100,
    );
  }

  @Get('timetable/conflicts')
  @Roles('CampusAdmin', 'SuperAdmin', 'Registrar')
  timetableConflicts(@Req() req: { user: AuthUser }) {
    return this.admin.timetableConflicts(this.tenant(req), req.user);
  }
}
