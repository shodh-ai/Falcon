import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AcademicsService } from './academics.service';
import { AcademicsFacultyService } from './academics-faculty.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { CreateGradingPolicyDto } from './dto/create-grading-policy.dto';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { BulkAttendanceDto } from './dto/bulk-attendance.dto';

type AuthUser = { user_id: string; role?: string; tenant_id?: string };

@Controller('api/academics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AcademicsController {
  constructor(
    private readonly academics: AcademicsService,
    private readonly facultyAcademics: AcademicsFacultyService,
  ) {}

  @Get('subjects')
  listSubjects() {
    return this.academics.listSubjects();
  }

  @Post('subjects')
  @Roles('SuperAdmin', 'Registrar')
  createSubject(@Body() dto: CreateSubjectDto) {
    return this.academics.createSubject(dto);
  }

  @Get('batches')
  listBatches() {
    return this.academics.listBatches();
  }

  @Get('faculty/today-classes')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  getFacultyTodayClasses(@Req() req: { user: AuthUser }) {
    return this.facultyAcademics.getFacultyTodayClasses(req.user.user_id);
  }

  @Get('classes/:classId/students')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  getClassStudents(@Param('classId', ParseIntPipe) classId: number) {
    return this.facultyAcademics.getClassStudents(classId);
  }

  @Post('attendance/bulk')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  bulkAttendance(@Body() dto: BulkAttendanceDto, @Req() req: { user: AuthUser }) {
    return this.facultyAcademics.bulkMarkAttendance(dto, req.user.user_id);
  }

  @Post('attendance')
  @Roles('Faculty', 'HOD', 'SuperAdmin')
  markAttendance(@Body() dto: MarkAttendanceDto, @Req() req: { user: AuthUser }) {
    return this.academics.markAttendance(dto, req.user.user_id);
  }

  @Get('results/student/:userId')
  studentResults(@Param('userId') userId: string) {
    return this.academics.listResultsForStudent(userId);
  }

  @Get('student/dashboard-summary')
  @Roles('Student')
  studentDashboardSummary(@Req() req: { user: AuthUser }) {
    return this.academics.getStudentDashboardSummary(req.user.user_id);
  }

  @Get('dashboard/metrics')
  @Roles('Student')
  dashboardMetrics(@Req() req: { user: AuthUser }) {
    return this.academics.getDashboardMetrics(req.user.user_id);
  }

  @Get('dashboard/timetable/today')
  @Roles('Student')
  todayTimetable(@Req() req: { user: AuthUser }) {
    return this.academics.getTodayTimetable(req.user.user_id);
  }

  @Get('courses/my-enrollments')
  @Roles('Student')
  myCourseEnrollments(@Req() req: { user: AuthUser }) {
    return this.academics.listMyCourseEnrollments(req.user.user_id);
  }

  @Get('courses/available-electives')
  @Roles('Student')
  availableElectives(@Req() req: { user: AuthUser }) {
    return this.academics.listAvailableElectives(
      req.user.user_id,
      this.resolveTenantId(req.user),
    );
  }

  @Post('courses/register')
  @Roles('Student')
  registerCourses(
    @Req() req: { user: AuthUser },
    @Body() dto: { course_ids?: string[] },
  ) {
    return this.academics.registerCourses(
      req.user.user_id,
      this.resolveTenantId(req.user),
      dto.course_ids ?? [],
    );
  }

  @Get('grading-policies')
  listGradingPolicies() {
    return this.academics.listGradingPolicies();
  }

  @Post('grading-policies')
  @Roles('SuperAdmin', 'Registrar')
  createGradingPolicy(@Body() dto: CreateGradingPolicyDto) {
    return this.academics.createGradingPolicy(dto);
  }

  private resolveTenantId(user: AuthUser) {
    return user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }
}
