import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AcademicsService } from './academics.service';
import { AcademicsFacultyService } from './academics-faculty.service';
import { AssignmentsService } from './assignments.service';
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
    private readonly assignments: AssignmentsService,
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

  @Get('faculty/timetable/today')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  getFacultyAcademicTimetableToday(@Req() req: { user: AuthUser }) {
    return this.facultyAcademics.getFacultyAcademicTimetableToday(
      req.user.user_id,
      this.resolveTenantId(req.user),
    );
  }

  @Get('faculty/course/:courseId/students')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  getFacultyCourseStudents(
    @Param('courseId') courseId: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.facultyAcademics.getCourseStudents(
      courseId,
      req.user.user_id,
      this.resolveTenantId(req.user),
    );
  }

  @Get('faculty/course/:courseId/attendance')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  getFacultyCourseAttendance(
    @Param('courseId') courseId: string,
    @Query('date') date: string | undefined,
    @Req() req: { user: AuthUser },
  ) {
    return this.facultyAcademics.getCourseAttendanceState(
      courseId,
      req.user.user_id,
      this.resolveTenantId(req.user),
      date,
    );
  }

  @Post('faculty/attendance')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  saveFacultyAttendance(
    @Req() req: { user: AuthUser },
    @Body() dto: { course_id: string; date?: string; attendance_data: { student_id: string; status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' }[] },
  ) {
    return this.facultyAcademics.saveCourseAttendanceLog(
      req.user.user_id,
      this.resolveTenantId(req.user),
      dto,
    );
  }

  @Post('faculty/materials/upload')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }))
  uploadFacultyMaterial(
    @Req() req: { user: AuthUser },
    @Body() dto: { course_id?: string; title?: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.facultyAcademics.uploadCourseMaterial(
      req.user.user_id,
      this.resolveTenantId(req.user),
      dto,
      file,
    );
  }

  @Get('faculty/assignments')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  listFacultyAssignments(
    @Req() req: { user: AuthUser },
    @Query('courseId') courseId?: string,
  ) {
    return this.assignments.listFacultyAssignments(
      req.user.user_id,
      this.resolveTenantId(req.user),
      courseId,
    );
  }

  @Post('faculty/assignments')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }))
  createFacultyAssignment(
    @Req() req: { user: AuthUser },
    @Body() dto: { course_id?: string; title?: string; description?: string; max_marks?: string; due_date?: string },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.assignments.createFacultyAssignment(
      req.user.user_id,
      this.resolveTenantId(req.user),
      dto,
      file,
    );
  }

  @Get('faculty/assignments/:assignmentId/submissions')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  listAssignmentSubmissions(
    @Param('assignmentId') assignmentId: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.assignments.listSubmissions(
      req.user.user_id,
      this.resolveTenantId(req.user),
      assignmentId,
    );
  }

  @Post('faculty/submissions/:submissionId/grade')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  gradeAssignmentSubmission(
    @Param('submissionId') submissionId: string,
    @Req() req: { user: AuthUser },
    @Body() dto: { marks_awarded?: string | number; faculty_remarks?: string },
  ) {
    return this.assignments.gradeSubmission(
      req.user.user_id,
      this.resolveTenantId(req.user),
      submissionId,
      dto,
    );
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

  @Get('hod/dashboard')
  @Roles('HOD', 'Dean', 'SuperAdmin')
  hodDashboard(@Req() req: { user: AuthUser }) {
    return this.academics.getHodDashboard(this.resolveTenantId(req.user), req.user.user_id);
  }

  @Get('hod/faculty-roster')
  @Roles('HOD', 'Dean', 'SuperAdmin')
  hodFacultyRoster(@Req() req: { user: AuthUser }) {
    return this.academics.listHodFacultyRoster(this.resolveTenantId(req.user), req.user.user_id);
  }

  @Post('hod/course-allocation')
  @Roles('HOD', 'Dean', 'SuperAdmin')
  hodCourseAllocation(
    @Req() req: { user: AuthUser },
    @Body() dto: { timetable_id: string; faculty_user_id: string },
  ) {
    return this.academics.allocateHodCourse(this.resolveTenantId(req.user), req.user.user_id, dto);
  }

  @Get('hod/student-monitor')
  @Roles('HOD', 'Dean', 'SuperAdmin')
  hodStudentMonitor(
    @Req() req: { user: AuthUser },
    @Query('lowAttendance') lowAttendance?: string,
  ) {
    return this.academics.listHodStudents(
      this.resolveTenantId(req.user),
      req.user.user_id,
      lowAttendance === 'true',
    );
  }

  @Get('hod/approvals/leaves')
  @Roles('HOD', 'Dean', 'SuperAdmin')
  hodLeaveApprovals(@Req() req: { user: AuthUser }) {
    return this.academics.listHodLeaveApprovals(this.resolveTenantId(req.user), req.user.user_id);
  }

  @Get('hod/approvals/gate-passes')
  @Roles('HOD', 'Dean', 'SuperAdmin')
  hodGatePassApprovals(@Req() req: { user: AuthUser }) {
    return this.academics.listHodGatePassApprovals(this.resolveTenantId(req.user), req.user.user_id);
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

  @Get('assignments/my')
  @Roles('Student')
  myAssignments(@Req() req: { user: AuthUser }) {
    return this.assignments.listStudentAssignments(
      req.user.user_id,
      this.resolveTenantId(req.user),
    );
  }

  @Post('assignments/:assignmentId/submit')
  @Roles('Student')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }))
  submitAssignment(
    @Param('assignmentId') assignmentId: string,
    @Req() req: { user: AuthUser },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.assignments.submitAssignment(
      req.user.user_id,
      this.resolveTenantId(req.user),
      assignmentId,
      file,
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
