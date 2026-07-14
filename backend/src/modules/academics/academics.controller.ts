import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import {
  assignmentPdfInterceptor,
  assignmentReferencePdfInterceptor,
  courseMaterialInterceptor,
  courseMaterialsInterceptor,
} from './lms-upload.config';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, Public } from '../../common/decorators/roles.decorator';
import { AcademicsService } from './academics.service';
import { AcademicsFacultyService } from './academics-faculty.service';
import { AssignmentsService } from './assignments.service';
import { FacultyWorkspacesService } from './faculty-workspaces.service';
import { CourseLmsService } from './course-lms.service';
import { AcademicProxyService } from './academic-proxy.service';
import { MarksheetPdfService } from './pdf/marksheet-pdf.service';
import { MarksHistoryService } from './marks-history.service';
import { CourseAllocationBulkService, type CourseAllocationRowInput } from './course-allocation-bulk.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { CreateGradingPolicyDto } from './dto/create-grading-policy.dto';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { BulkAttendanceDto } from './dto/bulk-attendance.dto';
import { SaveMarksDraftDto } from './dto/save-marks-draft.dto';
import { HodPortalExtService } from './hod-portal-ext.service';
import { FacultyTeachingDepartmentsService } from './faculty-teaching-departments.service';

type AuthUser = { user_id: string; role?: string; tenant_id?: string };

@Controller('api/academics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AcademicsController {
  constructor(
    private readonly academics: AcademicsService,
    private readonly facultyAcademics: AcademicsFacultyService,
    private readonly assignments: AssignmentsService,
    private readonly facultyWorkspaces: FacultyWorkspacesService,
    private readonly courseLms: CourseLmsService,
    private readonly academicProxy: AcademicProxyService,
    private readonly marksheetPdf: MarksheetPdfService,
    private readonly marksHistoryService: MarksHistoryService,
    private readonly courseAllocationBulk: CourseAllocationBulkService,
    private readonly hodPortalExt: HodPortalExtService,
    private readonly teachingDepartments: FacultyTeachingDepartmentsService,
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

  @Post('enrollments/assign-roll-numbers')
  @Roles('SuperAdmin', 'Registrar', 'HOD')
  assignRollNumbers(
    @Req() req: { user: AuthUser },
    @Body()
    dto: { semester: number; course_id?: string; sort_by?: 'name' | 'merit' },
  ) {
    return this.academics.assignSemesterRollNumbers(
      this.resolveTenantId(req.user),
      dto,
    );
  }

  @Get('faculty/teaching-departments')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  getFacultyTeachingDepartments(@Req() req: { user: AuthUser }) {
    return this.teachingDepartments.getTeachingDepartments(
      req.user.user_id,
      this.resolveTenantId(req.user),
    );
  }

  @Get('faculty/today-classes')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  getFacultyTodayClasses(@Req() req: { user: AuthUser }) {
    return this.facultyAcademics.getFacultyTodayClasses(req.user.user_id);
  }

  @Get('faculty/timetable/today')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  async getFacultyAcademicTimetableToday(
    @Req() req: { user: AuthUser },
    @Query('deptId') deptIdRaw?: string,
  ) {
    const deptId = await this.resolveFacultyDeptId(req, deptIdRaw);
    return this.facultyAcademics.getFacultyAcademicTimetableToday(
      req.user.user_id,
      this.resolveTenantId(req.user),
      deptId,
    );
  }

  @Get('faculty/attendance/missing')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  async getMissingAttendanceAlerts(
    @Req() req: { user: AuthUser },
    @Query('deptId') deptIdRaw?: string,
  ) {
    const deptId = await this.resolveFacultyDeptId(req, deptIdRaw);
    return this.facultyAcademics.getMissingAttendanceAlerts(
      req.user.user_id,
      this.resolveTenantId(req.user),
      deptId,
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
    @Query('timetableId') timetableId: string | undefined,
    @Req() req: { user: AuthUser },
  ) {
    return this.facultyAcademics.getCourseAttendanceState(
      courseId,
      req.user.user_id,
      this.resolveTenantId(req.user),
      date,
      timetableId,
    );
  }

  @Get('faculty/course/:courseId/attendance/previous-session')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  getPreviousSessionAttendance(
    @Param('courseId') courseId: string,
    @Query('date') date: string,
    @Query('timetableId') timetableId: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.facultyAcademics.getPreviousSessionAttendance(
      req.user.user_id,
      this.resolveTenantId(req.user),
      courseId,
      date,
      timetableId,
    );
  }

  @Get('faculty/course/:courseId/attendance/analytics')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  getFacultyCourseAttendanceAnalytics(
    @Param('courseId') courseId: string,
    @Query('date') date: string | undefined,
    @Req() req: { user: AuthUser },
  ) {
    return this.facultyAcademics.getAttendanceAnalytics(
      courseId,
      req.user.user_id,
      this.resolveTenantId(req.user),
      date,
    );
  }

  @Post('faculty/course/:courseId/attendance/warnings')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  sendFacultyCourseAttendanceWarnings(
    @Param('courseId') courseId: string,
    @Req() req: { user: AuthUser },
    @Body() dto: { student_ids?: string[] },
  ) {
    return this.facultyAcademics.sendAttendanceWarnings(
      courseId,
      req.user.user_id,
      this.resolveTenantId(req.user),
      dto.student_ids ?? [],
    );
  }

  @Post('faculty/attendance')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  saveFacultyAttendance(
    @Req() req: { user: AuthUser },
    @Body()
    dto: {
      course_id: string;
      date?: string;
      timetable_id?: string;
      attendance_data: {
        student_id: string;
        status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
      }[];
    },
  ) {
    return this.facultyAcademics.saveCourseAttendanceLog(
      req.user.user_id,
      this.resolveTenantId(req.user),
      dto,
    );
  }

  @Post('faculty/materials/upload')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  @UseInterceptors(courseMaterialsInterceptor())
  uploadFacultyMaterial(
    @Req() req: { user: AuthUser },
    @Body() dto: { course_id?: string; title?: string },
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.facultyAcademics.uploadCourseMaterials(
      req.user.user_id,
      this.resolveTenantId(req.user),
      dto,
      files,
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
  @UseInterceptors(assignmentReferencePdfInterceptor())
  createFacultyAssignment(
    @Req() req: { user: AuthUser },
    @Body()
    dto: {
      course_id?: string;
      title?: string;
      description?: string;
      max_marks?: string;
      start_date?: string;
      due_date?: string;
    },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.assignments.createFacultyAssignment(
      req.user.user_id,
      this.resolveTenantId(req.user),
      dto,
      file,
    );
  }

  @Patch('faculty/assignments/:assignmentId')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  @UseInterceptors(assignmentReferencePdfInterceptor())
  updateFacultyAssignment(
    @Param('assignmentId') assignmentId: string,
    @Req() req: { user: AuthUser },
    @Body()
    dto: {
      title?: string;
      description?: string;
      max_marks?: string;
      start_date?: string;
      due_date?: string;
    },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.assignments.updateFacultyAssignment(
      req.user.user_id,
      this.resolveTenantId(req.user),
      assignmentId,
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

  @Get('faculty/assignments/:assignmentId/roster')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  listAssignmentRoster(
    @Param('assignmentId') assignmentId: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.assignments.listAssignmentRoster(
      req.user.user_id,
      this.resolveTenantId(req.user),
      assignmentId,
    );
  }

  @Get('faculty/submissions/:submissionId/download')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  async downloadSubmission(
    @Param('submissionId') submissionId: string,
    @Req() req: { user: AuthUser },
    @Res() res: Response,
  ) {
    const submission = await this.assignments.getSubmissionForFacultyDownload(
      req.user.user_id,
      this.resolveTenantId(req.user),
      submissionId,
    );
    const file = await this.assignments.streamSubmissionFile(submission);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    return file.stream.pipe(res);
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

  @Post('faculty/submissions/:submissionId/return')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  returnAssignmentSubmission(
    @Param('submissionId') submissionId: string,
    @Req() req: { user: AuthUser },
    @Body() dto: { faculty_remarks?: string; revision_days?: number },
  ) {
    return this.assignments.returnForRevision(
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
  bulkAttendance(
    @Body() dto: BulkAttendanceDto,
    @Req() req: { user: AuthUser },
  ) {
    return this.facultyAcademics.bulkMarkAttendance(dto, req.user.user_id);
  }

  @Post('attendance')
  @Roles('Faculty', 'HOD', 'SuperAdmin')
  markAttendance(
    @Body() dto: MarkAttendanceDto,
    @Req() req: { user: AuthUser },
  ) {
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

  @Get('dashboard/timetable/weekly')
  @Roles('Student')
  weeklyTimetable(@Req() req: { user: AuthUser }) {
    return this.academics.getWeeklyTimetable(req.user.user_id);
  }

  @Get('dashboard/timetable/week')
  @Roles('Student')
  weeklyTimetableCalendar(
    @Req() req: { user: AuthUser },
    @Query('weekStart') weekStart?: string,
  ) {
    return this.academics.getWeeklyTimetableCalendar(
      req.user.user_id,
      weekStart,
    );
  }

  @Get('courses/my-enrollments')
  @Roles('Student')
  myCourseEnrollments(@Req() req: { user: AuthUser }) {
    return this.academics.listMyCourseEnrollments(
      req.user.user_id,
      this.resolveTenantId(req.user),
    );
  }

  @Get('hod/dashboard')
  @Roles('HOD', 'SuperAdmin')
  hodDashboard(@Req() req: { user: AuthUser }) {
    return this.academics.getHodDashboard(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Get('hod/command-center')
  @Roles('HOD', 'SuperAdmin')
  hodCommandCenter(@Req() req: { user: AuthUser }) {
    return this.academics.getHodCommandCenter(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Get('hod/faculty-workload')
  @Roles('HOD', 'SuperAdmin')
  hodFacultyWorkload(@Req() req: { user: AuthUser }) {
    return this.academics.listHodFacultyWorkload(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Get('hod/department-timetable')
  @Roles('HOD', 'SuperAdmin')
  hodDepartmentTimetable(@Req() req: { user: AuthUser }) {
    return this.academics.listHodDepartmentTimetable(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Get('hod/course-allocation-slots')
  @Roles('HOD')
  hodCourseAllocationSlots(@Req() req: { user: AuthUser }) {
    return this.academics.listHodCourseAllocationSlots(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Get('hod/course-allocation-timetable-data')
  @Roles('HOD')
  hodCourseAllocationTimetableData(@Req() req: { user: AuthUser }) {
    return this.academics.getHodCourseAllocationTimetableData(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Post('hod/course-allocation-timetable-batch-save')
  @Roles('HOD')
  hodCourseAllocationTimetableBatchSave(
    @Req() req: { user: AuthUser },
    @Body()
    dto: {
      semester: string;
      slots: Array<{
        course_id: string;
        faculty_user_id: string;
        day_of_week: number;
        start_time: string;
        end_time: string;
      }>;
    },
  ) {
    return this.academics.saveHodCourseAllocationTimetableBatch(
      this.resolveTenantId(req.user),
      req.user.user_id,
      dto,
    );
  }

  @Get('hod/courses/:courseId/students')
  @Roles('HOD', 'SuperAdmin')
  hodCourseStudents(
    @Req() req: { user: AuthUser },
    @Param('courseId') courseId: string,
  ) {
    return this.academics.listHodCourseStudents(
      this.resolveTenantId(req.user),
      req.user.user_id,
      courseId,
    );
  }

  @Get('hod/syllabus-coverage')
  @Roles('HOD', 'SuperAdmin')
  hodSyllabusCoverage(@Req() req: { user: AuthUser }) {
    return this.academics.listHodSyllabusCoverage(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Get('hod/result-analytics')
  @Roles('HOD', 'SuperAdmin')
  hodResultAnalytics(@Req() req: { user: AuthUser }) {
    return this.academics.listHodResultAnalytics(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Get('hod/department-reports')
  @Roles('HOD', 'SuperAdmin')
  hodDepartmentReports(@Req() req: { user: AuthUser }) {
    return this.academics.getHodDepartmentReports(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Get('hod/iqac/compiler')
  @Roles('HOD', 'SuperAdmin')
  hodIqacCompiler(@Req() req: { user: AuthUser }) {
    return this.academics.getHodIqacCompiler(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Post('hod/iqac/evidence')
  @Roles('HOD', 'SuperAdmin')
  hodIqacEvidence(
    @Req() req: { user: AuthUser },
    @Body()
    dto: {
      criterion_id: number;
      file_path: string;
      file_name: string;
      title?: string;
    },
  ) {
    return this.academics.uploadHodIqacEvidence(
      this.resolveTenantId(req.user),
      req.user.user_id,
      dto,
    );
  }

  @Post('hod/iqac/submit')
  @Roles('HOD', 'SuperAdmin')
  hodIqacSubmit(
    @Req() req: { user: AuthUser },
    @Body()
    dto: {
      comments?: string;
      master_file_path?: string;
      master_file_name?: string;
    },
  ) {
    return this.academics.submitHodIqacDepartment(
      this.resolveTenantId(req.user),
      req.user.user_id,
      dto,
    );
  }

  @Get('hod/grievances')
  @Roles('HOD', 'SuperAdmin')
  hodGrievances(@Req() req: { user: AuthUser }) {
    return this.academics.listHodGrievances(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Get('hod/slow-learners')
  @Roles('HOD', 'SuperAdmin')
  hodSlowLearners(@Req() req: { user: AuthUser }) {
    return this.academics.listHodSlowLearners(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Get('hod/appraisals')
  @Roles('HOD', 'SuperAdmin')
  hodAppraisals(@Req() req: { user: AuthUser }) {
    return this.academics.listHodAppraisals(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Patch('hod/appraisals/:appraisalId/rating')
  @Roles('HOD', 'SuperAdmin')
  hodAppraisalRating(
    @Req() req: { user: AuthUser },
    @Param('appraisalId') appraisalId: string,
    @Body() body: { hod_rating: number },
  ) {
    return this.academics.submitHodAppraisalRating(
      this.resolveTenantId(req.user),
      req.user.user_id,
      appraisalId,
      body.hod_rating,
    );
  }

  @Get('hod/faculty-roster')
  @Roles('HOD', 'SuperAdmin')
  hodFacultyRoster(@Req() req: { user: AuthUser }) {
    return this.academics.listHodFacultyRoster(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Get('hod/faculty-audit')
  @Roles('HOD', 'SuperAdmin')
  hodFacultyAudit(@Req() req: { user: AuthUser }) {
    return this.academics.getHodFacultyAudit(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Post('hod/faculty-audit/unlock-action')
  @Roles('HOD', 'SuperAdmin')
  hodFacultyAuditUnlockAction(
    @Req() req: { user: AuthUser },
    @Body() dto: { course_id: string; action: 'APPROVE' | 'REJECT' },
  ) {
    return this.academics.handleHodUnlockAction(
      this.resolveTenantId(req.user),
      req.user.user_id,
      dto,
    );
  }

  @Post('hod/faculty-audit/attendance-reminder')
  @Roles('HOD', 'SuperAdmin')
  hodFacultyAttendanceReminder(
    @Req() req: { user: AuthUser },
    @Body()
    dto: {
      faculty_user_id: string;
      subject_code: string;
      missing_classes: string[];
    },
  ) {
    return this.academics.notifyFacultyMissingAttendance(
      this.resolveTenantId(req.user),
      req.user.user_id,
      dto,
    );
  }

  @Get('hod/faculty-audit/export')
  @Roles('HOD', 'SuperAdmin')
  async hodFacultyAuditExport(
    @Req() req: { user: AuthUser },
    @Res({ passthrough: true }) res: Response,
    @Query('faculty_user_id') facultyUserId?: string,
  ) {
    const buf = await this.hodPortalExt.exportFacultyAuditExcel(
      this.resolveTenantId(req.user),
      req.user.user_id,
      facultyUserId,
    );
    const suffix = facultyUserId ? 'faculty' : 'all-faculty';
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="hod-faculty-audit-${suffix}.xlsx"`,
    );
    return new StreamableFile(buf);
  }

  @Get('hod/compiled-results/courses')
  @Roles('HOD', 'SuperAdmin')
  hodCompiledResultsCourses(
    @Req() req: { user: AuthUser },
    @Query('semester', ParseIntPipe) semester: number,
  ) {
    return this.hodPortalExt.listCompiledResultsCourses(
      this.resolveTenantId(req.user),
      req.user.user_id,
      semester,
    );
  }

  @Get('hod/compiled-results/table')
  @Roles('HOD', 'SuperAdmin')
  hodCompiledResultsTable(
    @Req() req: { user: AuthUser },
    @Query('semester', ParseIntPipe) semester: number,
    @Query('course_id') courseId: string,
  ) {
    return this.hodPortalExt.getCompiledResultsTable(
      this.resolveTenantId(req.user),
      req.user.user_id,
      semester,
      courseId,
    );
  }

  @Get('hod/compiled-results/export')
  @Roles('HOD', 'SuperAdmin')
  async hodCompiledResultsExport(
    @Req() req: { user: AuthUser },
    @Res({ passthrough: true }) res: Response,
    @Query('semester', ParseIntPipe) semester: number,
    @Query('course_id') courseId: string,
    @Query('student_user_id') studentUserId?: string,
  ) {
    const buf = await this.hodPortalExt.exportCompiledResultsExcel(
      this.resolveTenantId(req.user),
      req.user.user_id,
      semester,
      courseId,
      studentUserId,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="compiled-results-sem${semester}.xlsx"`,
    );
    return new StreamableFile(buf);
  }

  @Get('hod/placement/settings')
  @Roles('HOD', 'SuperAdmin')
  hodPlacementSettings(@Req() req: { user: AuthUser }) {
    return this.hodPortalExt.getPlacementSettings(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Post('hod/placement/coordinator')
  @Roles('HOD', 'SuperAdmin')
  hodSetPlacementCoordinator(
    @Req() req: { user: AuthUser },
    @Body() dto: { coordinator_user_id: string },
  ) {
    return this.hodPortalExt.setPlacementCoordinator(
      this.resolveTenantId(req.user),
      req.user.user_id,
      dto.coordinator_user_id,
    );
  }

  @Get('hod/placement/drives')
  @Roles('HOD', 'SuperAdmin', 'Faculty')
  hodListPlacementDrives(@Req() req: { user: AuthUser & { role?: string } }) {
    return this.hodPortalExt.listPlacementDrives(
      this.resolveTenantId(req.user),
      req.user.user_id,
      req.user.role ?? 'Faculty',
    );
  }

  @Post('hod/placement/drives')
  @Roles('HOD', 'SuperAdmin', 'Faculty')
  hodCreatePlacementDrive(
    @Req() req: { user: AuthUser & { role?: string } },
    @Body()
    dto: {
      company_name: string;
      job_role?: string;
      drive_date?: string;
      drive_time?: string;
      semester?: number;
      form_url?: string;
      form_type?: string;
      description?: string;
    },
  ) {
    return this.hodPortalExt.createPlacementDrive(
      this.resolveTenantId(req.user),
      req.user.user_id,
      req.user.role ?? 'Faculty',
      dto,
    );
  }

  @Patch('hod/placement/drives/:driveId')
  @Roles('HOD', 'SuperAdmin', 'Faculty')
  hodUpdatePlacementDrive(
    @Req() req: { user: AuthUser & { role?: string } },
    @Param('driveId') driveId: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.hodPortalExt.updatePlacementDrive(
      this.resolveTenantId(req.user),
      req.user.user_id,
      req.user.role ?? 'Faculty',
      driveId,
      dto,
    );
  }

  @Delete('hod/placement/drives/:driveId')
  @Roles('HOD', 'SuperAdmin', 'Faculty')
  hodDeletePlacementDrive(
    @Req() req: { user: AuthUser & { role?: string } },
    @Param('driveId') driveId: string,
  ) {
    return this.hodPortalExt.deletePlacementDrive(
      this.resolveTenantId(req.user),
      req.user.user_id,
      req.user.role ?? 'Faculty',
      driveId,
    );
  }

  @Get('hod/placement/students/search')
  @Roles('HOD', 'SuperAdmin', 'Faculty')
  hodSearchPlacementStudents(
    @Req() req: { user: AuthUser & { role?: string } },
    @Query('q') query: string,
    @Query('drive_id') driveId?: string,
  ) {
    return this.hodPortalExt.searchPlacementStudents(
      this.resolveTenantId(req.user),
      req.user.user_id,
      req.user.role ?? 'Faculty',
      query ?? '',
      driveId,
    );
  }

  @Get('hod/placement/drives/:driveId/responses')
  @Roles('HOD', 'SuperAdmin', 'Faculty')
  hodListDriveResponses(
    @Req() req: { user: AuthUser & { role?: string } },
    @Param('driveId') driveId: string,
    @Query('submitted_date') submittedDate?: string,
  ) {
    return this.hodPortalExt.listDriveResponses(
      this.resolveTenantId(req.user),
      req.user.user_id,
      req.user.role ?? 'Faculty',
      driveId,
      submittedDate,
    );
  }

  @Post('hod/placement/drives/:driveId/responses')
  @Roles('HOD', 'SuperAdmin', 'Faculty')
  hodAddDriveResponse(
    @Req() req: { user: AuthUser & { role?: string } },
    @Param('driveId') driveId: string,
    @Body()
    dto: {
      student_user_id?: string;
      student_name?: string;
      student_email?: string;
      enrollment_no?: string;
      phone?: string;
      notes?: string;
    },
  ) {
    return this.hodPortalExt.addManualDriveResponse(
      this.resolveTenantId(req.user),
      req.user.user_id,
      req.user.role ?? 'Faculty',
      driveId,
      dto,
    );
  }

  @Get('hod/placement/drives/:driveId/registrations/export')
  @Roles('HOD', 'SuperAdmin', 'Faculty')
  async hodExportPlacementDriveRegistrations(
    @Req() req: { user: AuthUser & { role?: string } },
    @Res({ passthrough: true }) res: Response,
    @Param('driveId') driveId: string,
    @Query('response_id') responseId?: string,
  ) {
    const { buffer, filename } = await this.hodPortalExt.exportPlacementDriveRegistrationsExcel(
      this.resolveTenantId(req.user),
      req.user.user_id,
      req.user.role ?? 'Faculty',
      driveId,
      responseId,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(buffer);
  }

  @Get('hod/placement/registrations/export')
  @Roles('HOD', 'SuperAdmin', 'Faculty')
  async hodExportAllPlacementRegistrations(
    @Req() req: { user: AuthUser & { role?: string } },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, filename } = await this.hodPortalExt.exportAllPlacementRegistrationsExcel(
      this.resolveTenantId(req.user),
      req.user.user_id,
      req.user.role ?? 'Faculty',
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(buffer);
  }

  @Public()
  @Post('placement/google-form/webhook')
  googleFormPlacementWebhook(
    @Body()
    dto: {
      drive_id: string;
      secret: string;
      student_name?: string;
      student_email?: string;
      enrollment_no?: string;
      phone?: string;
      google_response_id?: string;
      fields?: Record<string, string>;
    },
  ) {
    return this.hodPortalExt.handleGoogleFormWebhook(dto);
  }

  @Get('hod/placement/drives/:driveId/google-form-sync')
  @Roles('HOD', 'SuperAdmin', 'Faculty')
  hodGoogleFormSyncSetup(
    @Req() req: { user: AuthUser & { role?: string }; protocol: string; get: (h: string) => string | undefined },
    @Param('driveId') driveId: string,
  ) {
    const webhookBaseUrl =
      process.env.PUBLIC_API_URL?.trim() ||
      `${req.protocol}://${req.get('host') ?? 'localhost:4000'}`;
    return this.hodPortalExt.getGoogleFormSyncSetup(
      this.resolveTenantId(req.user),
      req.user.user_id,
      req.user.role ?? 'Faculty',
      driveId,
      webhookBaseUrl,
    );
  }

  @Post('hod/placement/drives/:driveId/google-form-sync/regenerate-secret')
  @Roles('HOD', 'SuperAdmin', 'Faculty')
  hodRegenerateGoogleFormSyncSecret(
    @Req() req: { user: AuthUser & { role?: string }; protocol: string; get: (h: string) => string | undefined },
    @Param('driveId') driveId: string,
  ) {
    const webhookBaseUrl =
      process.env.PUBLIC_API_URL?.trim() ||
      `${req.protocol}://${req.get('host') ?? 'localhost:4000'}`;
    return this.hodPortalExt.regenerateGoogleFormWebhookSecret(
      this.resolveTenantId(req.user),
      req.user.user_id,
      req.user.role ?? 'Faculty',
      driveId,
      webhookBaseUrl,
    );
  }

  @Get('student/placement/drives')
  @Roles('Student')
  studentPlacementDrives(@Req() req: { user: AuthUser }) {
    return this.hodPortalExt.listStudentPlacementDrives(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Post('student/placement/drives/:driveId/register')
  @Roles('Student')
  studentRegisterPlacementDrive(
    @Req() req: { user: AuthUser },
    @Param('driveId') driveId: string,
    @Body()
    dto: {
      student_name?: string;
      student_email?: string;
      enrollment_no?: string;
      phone?: string;
      response_json?: Record<string, unknown>;
    },
  ) {
    return this.hodPortalExt.submitDriveResponse(
      this.resolveTenantId(req.user),
      req.user.user_id,
      driveId,
      dto,
    );
  }

  @Get('faculty/placement/coordinator-status')
  @Roles('Faculty', 'HOD', 'SuperAdmin')
  facultyPlacementCoordinatorStatus(@Req() req: { user: AuthUser }) {
    return this.hodPortalExt.isPlacementCoordinator(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Post('hod/course-allocation')
  @Roles('HOD')
  hodCourseAllocation(
    @Req() req: { user: AuthUser },
    @Body()
    dto: {
      timetable_id: string;
      faculty_user_id: string;
      day_of_week?: number;
      start_time?: string;
      end_time?: string;
    },
  ) {
    return this.academics.allocateHodCourse(
      this.resolveTenantId(req.user),
      req.user.user_id,
      dto,
    );
  }

  @Get('hod/teaching-load/unassigned')
  @Roles('HOD')
  hodUnassignedTeachingLoad(@Req() req: { user: AuthUser }) {
    return this.courseAllocationBulk.listUnassignedForHod(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Get('hod/teaching-load/assigned')
  @Roles('HOD')
  hodAssignedTeachingLoad(@Req() req: { user: AuthUser }) {
    return this.courseAllocationBulk.listAssignedForHod(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Get('hod/teaching-load/unassigned/count')
  @Roles('HOD')
  async hodUnassignedTeachingLoadCount(@Req() req: { user: AuthUser }) {
    const count = await this.courseAllocationBulk.countUnassigned(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
    return { count };
  }

  @Patch('hod/teaching-load/:allocationId/assign')
  @Roles('HOD')
  hodAssignTeachingLoad(
    @Req() req: { user: AuthUser },
    @Param('allocationId') allocationId: string,
    @Body() dto: { faculty_user_id: string },
  ) {
    return this.courseAllocationBulk.assignFacultyToAllocation(
      this.resolveTenantId(req.user),
      req.user.user_id,
      allocationId,
      dto.faculty_user_id,
    );
  }

  @Patch('hod/teaching-load/:allocationId/reassign')
  @Roles('HOD')
  hodReassignTeachingLoad(
    @Req() req: { user: AuthUser },
    @Param('allocationId') allocationId: string,
    @Body() dto: { faculty_user_id: string },
  ) {
    return this.courseAllocationBulk.reassignFacultyForHod(
      this.resolveTenantId(req.user),
      req.user.user_id,
      allocationId,
      dto.faculty_user_id,
    );
  }

  @Get('hod/course-mapper/template')
  @Roles('HOD')
  async hodCourseMapperTemplate(@Res({ passthrough: true }) res: Response) {
    const buffer = await this.courseAllocationBulk.buildTemplateBuffer();
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition':
        'attachment; filename="course-allocation-matrix-template.xlsx"',
    });
    return new StreamableFile(buffer);
  }

  @Post('hod/course-mapper/preview')
  @Roles('HOD')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async hodCourseMapperPreview(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: { user: AuthUser },
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const rows = await this.courseAllocationBulk.parseUploadFile(
      file.buffer,
      file.originalname,
    );
    return this.courseAllocationBulk.buildPreview(
      this.resolveTenantId(req.user),
      rows,
      req.user.user_id,
    );
  }

  @Post('hod/course-mapper/execute')
  @Roles('HOD')
  hodCourseMapperExecute(
    @Req() req: { user: AuthUser },
    @Body()
    dto: { academic_year: string; rows: CourseAllocationRowInput[] },
  ) {
    return this.courseAllocationBulk.executeBulkMap(
      this.resolveTenantId(req.user),
      dto.academic_year,
      dto.rows,
      req.user.user_id,
    );
  }

  @Patch('faculty/timetable/:timetableId')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  updateTimetableSlot(
    @Req() req: { user: AuthUser },
    @Param('timetableId') timetableId: string,
    @Body()
    dto: {
      day_of_week?: number;
      start_time?: string;
      end_time?: string;
      room?: string;
      cancelled?: boolean;
    },
  ) {
    return this.academics.updateTimetableSlot(
      this.resolveTenantId(req.user),
      timetableId,
      dto,
    );
  }

  @Get('hod/student-monitor')
  @Roles('HOD', 'SuperAdmin')
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

  @Get('hod/student-monitor/:studentId/detail')
  @Roles('HOD', 'SuperAdmin')
  hodStudentMonitorDetail(
    @Param('studentId') studentId: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.academics.getHodStudentDetail(
      this.resolveTenantId(req.user),
      req.user.user_id,
      studentId,
    );
  }
  @Get('hod/approvals/leaves')
  @Roles('HOD', 'SuperAdmin')
  hodLeaveApprovals(@Req() req: { user: AuthUser }) {
    return this.academics.listHodLeaveApprovals(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Get('hod/approvals/gate-passes')
  @Roles('HOD', 'SuperAdmin')
  hodGatePassApprovals(@Req() req: { user: AuthUser }) {
    return this.academics.listHodGatePassApprovals(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Get('hod/approvals/extra-classes')
  @Roles('HOD', 'SuperAdmin')
  hodExtraClassApprovals(@Req() req: { user: AuthUser }) {
    return this.facultyWorkspaces.listHodPendingAdjustments(
      req.user.user_id,
      this.resolveTenantId(req.user),
    );
  }

  @Get('dean/command-center')
  @Roles('Dean', 'SuperAdmin')
  deanCommandCenter(@Req() req: { user: AuthUser }) {
    return this.academics.getDeanCommandCenter(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Get('dean/departments')
  @Roles('Dean', 'SuperAdmin')
  deanDepartments(@Req() req: { user: AuthUser }) {
    return this.academics.listDeanDepartments(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Get('dean/faculty-workload')
  @Roles('Dean', 'SuperAdmin')
  deanFacultyWorkload(@Req() req: { user: AuthUser }) {
    return this.academics.listDeanFacultyWorkload(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Get('dean/timetable')
  @Roles('Dean', 'SuperAdmin')
  deanTimetable(@Req() req: { user: AuthUser }) {
    return this.academics.listDeanDepartmentTimetable(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Get('dean/course-allocation')
  @Roles('Dean', 'SuperAdmin')
  deanCourseAllocation(@Req() req: { user: AuthUser }) {
    return this.academics.listDeanCourseAllocationSlots(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Get('dean/syllabus-coverage')
  @Roles('Dean', 'SuperAdmin')
  deanSyllabusCoverage(@Req() req: { user: AuthUser }) {
    return this.academics.listDeanSyllabusCoverage(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Get('dean/result-analytics')
  @Roles('Dean', 'SuperAdmin')
  deanResultAnalytics(@Req() req: { user: AuthUser }) {
    return this.academics.listDeanResultAnalytics(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Get('dean/students')
  @Roles('Dean', 'SuperAdmin')
  deanStudents(
    @Req() req: { user: AuthUser },
    @Query('lowAttendance') lowAttendance?: string,
  ) {
    return this.academics.listDeanStudents(
      this.resolveTenantId(req.user),
      req.user.user_id,
      lowAttendance === 'true',
    );
  }

  @Get('dean/student-monitor/:studentId/detail')
  @Roles('Dean', 'SuperAdmin')
  deanStudentMonitorDetail(
    @Param('studentId') studentId: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.academics.getDeanStudentDetail(
      this.resolveTenantId(req.user),
      req.user.user_id,
      studentId,
    );
  }

  @Get('dean/slow-learners')
  @Roles('Dean', 'SuperAdmin')
  deanSlowLearners(@Req() req: { user: AuthUser }) {
    return this.academics.listDeanSlowLearners(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Get('dean/grievances')
  @Roles('Dean', 'SuperAdmin')
  deanGrievances(@Req() req: { user: AuthUser }) {
    return this.academics.listDeanGrievances(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Get('dean/appraisals')
  @Roles('Dean', 'SuperAdmin')
  deanAppraisals(@Req() req: { user: AuthUser }) {
    return this.academics.listDeanAppraisals(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Get('dean/inbox')
  @Roles('Dean', 'SuperAdmin')
  deanInbox(@Req() req: { user: AuthUser }) {
    return this.academics.listDeanInbox(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Patch('hod/approvals/extra-classes/:adjustmentId')
  @Roles('HOD', 'Dean', 'SuperAdmin')
  actOnExtraClass(
    @Param('adjustmentId') adjustmentId: string,
    @Req() req: { user: AuthUser },
    @Body() body: { action: 'APPROVE' | 'REJECT'; remarks?: string },
  ) {
    return this.facultyWorkspaces.actOnClassAdjustment(
      req.user.user_id,
      this.resolveTenantId(req.user),
      adjustmentId,
      body.action,
      body.remarks,
    );
  }

  @Get('faculty/proxy/lectures')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  proxyLecturesForLeave(
    @Req() req: { user: AuthUser },
    @Query('start_date') startDate: string,
    @Query('end_date') endDate: string,
  ) {
    return this.academicProxy.listLecturesForLeaveDates(
      req.user.user_id,
      this.resolveTenantId(req.user),
      startDate,
      endDate,
    );
  }

  @Get('faculty/proxy/colleagues')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  proxyColleagues(@Req() req: { user: AuthUser }) {
    return this.academicProxy.listDepartmentFacultyForProxy(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Post('faculty/proxy-requests')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  createProxyRequest(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      timetable_id: string;
      proxy_faculty_id: string;
      date_of_proxy: string;
      reason?: string;
    },
  ) {
    return this.academicProxy.createProxyRequest(
      req.user.user_id,
      this.resolveTenantId(req.user),
      body,
    );
  }

  @Get('faculty/proxy-requests')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  myProxyRequests(@Req() req: { user: AuthUser }) {
    return this.academicProxy.listMyProxyRequests(
      req.user.user_id,
      this.resolveTenantId(req.user),
    );
  }

  @Get('hod/approvals/proxy-requests')
  @Roles('HOD', 'Dean', 'SuperAdmin')
  hodProxyApprovals(@Req() req: { user: AuthUser }) {
    return this.academicProxy.listHodPendingProxies(
      req.user.user_id,
      this.resolveTenantId(req.user),
    );
  }

  @Patch('hod/approvals/proxy-requests/:proxyId')
  @Roles('HOD', 'Dean', 'SuperAdmin')
  actOnProxyRequest(
    @Param('proxyId') proxyId: string,
    @Req() req: { user: AuthUser },
    @Body() body: { action: 'APPROVE' | 'REJECT'; remarks?: string },
  ) {
    return this.academicProxy.actOnProxyRequest(
      req.user.user_id,
      this.resolveTenantId(req.user),
      proxyId,
      body.action,
      body.remarks,
    );
  }

  @Patch('hod/modules/:moduleId/plan')
  @Roles('HOD', 'Dean', 'SuperAdmin')
  approveModulePlan(
    @Param('moduleId') moduleId: string,
    @Req() req: { user: AuthUser },
    @Body() body: { action: 'APPROVE' | 'REJECT' },
  ) {
    return this.courseLms.approveModulePlan(
      req.user.user_id,
      this.resolveTenantId(req.user),
      moduleId,
      body.action,
    );
  }

  @Get('faculty/courses/:courseId/study-groups')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  listStudyGroups(
    @Param('courseId') courseId: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.courseLms.listStudyGroups(
      req.user.user_id,
      this.resolveTenantId(req.user),
      courseId,
    );
  }

  @Post('faculty/courses/:courseId/study-groups')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  createStudyGroup(
    @Param('courseId') courseId: string,
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      group_name: string;
      is_compulsory?: boolean;
      student_user_ids?: string[];
    },
  ) {
    return this.courseLms.createStudyGroup(
      req.user.user_id,
      this.resolveTenantId(req.user),
      courseId,
      body,
    );
  }

  @Post('faculty/study-groups/:groupId/materials')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  @UseInterceptors(courseMaterialInterceptor())
  uploadGroupMaterial(
    @Param('groupId') groupId: string,
    @Req() req: { user: AuthUser },
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { title?: string; material_type?: string },
  ) {
    return this.courseLms.uploadGroupMaterial(
      req.user.user_id,
      this.resolveTenantId(req.user),
      groupId,
      file,
      body,
    );
  }

  @Get('student/courses/:courseId/study-groups')
  @Roles('Student')
  studentStudyGroups(
    @Param('courseId') courseId: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.courseLms.listStudentStudyGroups(
      req.user.user_id,
      this.resolveTenantId(req.user),
      courseId,
    );
  }

  @Post('student/study-groups/:groupId/join')
  @Roles('Student')
  joinStudyGroup(
    @Param('groupId') groupId: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.courseLms.joinStudyGroup(
      req.user.user_id,
      this.resolveTenantId(req.user),
      groupId,
    );
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
  @UseInterceptors(assignmentPdfInterceptor())
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

  @Get('faculty/workspaces/courses')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  async facultyWorkspaceCourses(
    @Req() req: { user: AuthUser },
    @Query('deptId') deptIdRaw?: string,
  ) {
    const deptId = await this.resolveFacultyDeptId(req, deptIdRaw);
    return this.facultyWorkspaces.listFacultyCourses(
      req.user.user_id,
      this.resolveTenantId(req.user),
      deptId,
    );
  }

  @Get('faculty/workspaces/timetable')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  async facultyWorkspaceTimetable(
    @Req() req: { user: AuthUser },
    @Query('deptId') deptIdRaw?: string,
  ) {
    const deptId = await this.resolveFacultyDeptId(req, deptIdRaw);
    return this.facultyWorkspaces.getWeeklyTimetable(
      req.user.user_id,
      this.resolveTenantId(req.user),
      deptId,
    );
  }

  @Get('faculty/workspaces/timetable/schedule-data')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  async facultyWorkspaceScheduleData(
    @Req() req: { user: AuthUser },
    @Query('deptId') deptIdRaw?: string,
  ) {
    const deptId = await this.resolveFacultyDeptId(req, deptIdRaw);
    return this.facultyWorkspaces.getFacultyScheduleData(
      req.user.user_id,
      this.resolveTenantId(req.user),
      deptId,
    );
  }

  @Post('faculty/workspaces/timetable/slots')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  facultyWorkspaceTimetableSlotsBatch(
    @Req() req: { user: AuthUser },
    @Body() dto: { slots: Array<any> }
  ) {
    return this.facultyWorkspaces.scheduleTimetableSlotBatch(
      req.user.user_id,
      this.resolveTenantId(req.user),
      dto,
    );
  }

  @Get('faculty/workspaces/timetable/rooms/availability')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  getAvailableRoomsForSlot(
    @Req() req: { user: AuthUser },
    @Query('day') day: string,
    @Query('startTime') startTime: string,
    @Query('endTime') endTime: string
  ) {
    if (!day || !startTime || !endTime) {
      throw new BadRequestException('day, startTime, and endTime are required');
    }
    return this.facultyWorkspaces.getAvailableRoomsForSlot(
      this.resolveTenantId(req.user),
      parseInt(day, 10),
      startTime,
      endTime
    );
  }

  @Get('faculty/workspaces/timetable/stats')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  async facultyWorkspaceTimetableStats(
    @Req() req: { user: AuthUser },
    @Query('deptId') deptIdRaw?: string,
  ) {
    const deptId = await this.resolveFacultyDeptId(req, deptIdRaw);
    return this.facultyWorkspaces.getTimetableStats(
      req.user.user_id,
      this.resolveTenantId(req.user),
      deptId,
    );
  }

  @Get('faculty/workspaces/marks')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  facultyWorkspaceMarks(
    @Req() req: { user: AuthUser },
    @Query('courseId') courseId: string,
    @Query('examType') examType: string,
  ) {
    return this.facultyWorkspaces.listMarks(
      req.user.user_id,
      this.resolveTenantId(req.user),
      courseId,
      examType ?? 'CAT1',
    );
  }

  @Get('grading/roster')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  gradingRoster(
    @Req() req: { user: AuthUser },
    @Query('courseId') courseId: string,
    @Query('examType') examType: string,
  ) {
    return this.facultyWorkspaces.listMarks(
      req.user.user_id,
      this.resolveTenantId(req.user),
      courseId,
      examType ?? 'CAT1',
    );
  }

  @Post('faculty/workspaces/marks/draft')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  saveMarksDraft(
    @Req() req: { user: AuthUser },
    @Body() body: SaveMarksDraftDto,
  ) {
    return this.facultyWorkspaces.saveMarksDraft(
      req.user.user_id,
      this.resolveTenantId(req.user),
      body,
    );
  }

  @Post('faculty/workspaces/marks/publish')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  publishMarks(
    @Req() req: { user: AuthUser },
    @Body() dto: { course_id: string; exam_type: string },
  ) {
    return this.facultyWorkspaces.publishMarks(
      req.user.user_id,
      this.resolveTenantId(req.user),
      dto.course_id,
      dto.exam_type,
    );
  }

  @Get('faculty/workspaces/grading-components')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  listGradingComponents() {
    return this.facultyWorkspaces.listGradingComponents();
  }

  @Get('faculty/workspaces/course/:courseId/unified-marks')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  getUnifiedCourseMarks(
    @Req() req: { user: AuthUser },
    @Param('courseId') courseId: string,
    @Query('components') components?: string,
  ) {
    const componentList = components
      ? components
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : undefined;
    return this.facultyWorkspaces.getUnifiedCourseMarks(
      req.user.user_id,
      this.resolveTenantId(req.user),
      courseId,
      componentList,
    );
  }

  @Post('faculty/workspaces/course/:courseId/publish-all')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  publishAllCourseMarks(
    @Req() req: { user: AuthUser },
    @Param('courseId') courseId: string,
  ) {
    return this.facultyWorkspaces.publishAllCourseMarks(
      req.user.user_id,
      this.resolveTenantId(req.user),
      courseId,
    );
  }

  @Get('faculty/workspaces/copo')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  listCoPo(
    @Req() req: { user: AuthUser },
    @Query('courseId') courseId: string,
  ) {
    return this.facultyWorkspaces.listCoPoMappings(
      this.resolveTenantId(req.user),
      courseId,
    );
  }

  @Post('faculty/workspaces/copo')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  upsertCoPo(
    @Req() req: { user: AuthUser },
    @Body() body: Record<string, unknown>,
  ) {
    return this.facultyWorkspaces.upsertCoPoMapping(
      req.user.user_id,
      this.resolveTenantId(req.user),
      body as Parameters<FacultyWorkspacesService['upsertCoPoMapping']>[2],
    );
  }

  @Get('faculty/workspaces/adjustments')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  listAdjustments(@Req() req: { user: AuthUser }) {
    return this.facultyWorkspaces.listClassAdjustments(
      req.user.user_id,
      this.resolveTenantId(req.user),
    );
  }

  @Post('faculty/workspaces/adjustments')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  createAdjustment(
    @Req() req: { user: AuthUser },
    @Body() body: Record<string, unknown>,
  ) {
    return this.facultyWorkspaces.createClassAdjustment(
      req.user.user_id,
      this.resolveTenantId(req.user),
      body as Parameters<FacultyWorkspacesService['createClassAdjustment']>[2],
    );
  }

  @Get('faculty/workspaces/research')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  listResearch(@Req() req: { user: AuthUser }) {
    return this.facultyWorkspaces.listResearchLogs(
      req.user.user_id,
      this.resolveTenantId(req.user),
    );
  }

  @Post('faculty/workspaces/research')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  createResearch(
    @Req() req: { user: AuthUser },
    @Body() body: Record<string, unknown>,
  ) {
    return this.facultyWorkspaces.createResearchLog(
      req.user.user_id,
      this.resolveTenantId(req.user),
      body as Parameters<FacultyWorkspacesService['createResearchLog']>[2],
    );
  }

  @Get('faculty/workspaces/invigilation')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  listInvigilation(@Req() req: { user: AuthUser }) {
    return this.facultyWorkspaces.listInvigilation(
      req.user.user_id,
      this.resolveTenantId(req.user),
    );
  }

  @Post('faculty/workspaces/invigilation/:assignmentId/excuse')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  requestInvigilationUnavailability(
    @Req() req: { user: AuthUser },
    @Param('assignmentId') assignmentId: string,
    @Body('reason') reason: string,
  ) {
    if (!reason?.trim()) throw new BadRequestException('Reason is required');
    return this.facultyWorkspaces.requestInvigilationUnavailability(
      req.user.user_id,
      this.resolveTenantId(req.user),
      assignmentId,
      reason,
    );
  }

  @Post('faculty/workspaces/projects/assign')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  assignProjectGuide(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      faculty_user_id?: string;
      project_title: string;
      program?: string;
      start_date?: string;
      end_date?: string;
      funding_allocated?: number;
      student_ids: string[];
    },
  ) {
    const targetFacultyId = body.faculty_user_id || req.user.user_id;
    return this.facultyWorkspaces.assignProjectGuide(
      targetFacultyId,
      this.resolveTenantId(req.user),
      { ...body, student_ids: body.student_ids || [] },
    );
  }

  @Patch('faculty/workspaces/projects/:guideId/students')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  updateProjectStudents(
    @Req() req: { user: AuthUser },
    @Param('guideId') guideId: string,
    @Body() body: { students: { student_user_id: string; grade?: string }[] },
  ) {
    return this.facultyWorkspaces.updateProjectStudents(
      guideId,
      req.user.user_id,
      this.resolveTenantId(req.user),
      body.students,
    );
  }

  @Patch('faculty/workspaces/projects/:guideId/complete')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  completeProject(
    @Req() req: { user: AuthUser },
    @Param('guideId') guideId: string,
  ) {
    return this.facultyWorkspaces.completeProject(
      guideId,
      req.user.user_id,
      this.resolveTenantId(req.user),
    );
  }

  @Post('faculty/workspaces/projects/:guideId/funding')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  requestFunding(
    @Req() req: { user: AuthUser },
    @Param('guideId') guideId: string,
    @Body() body: { amount: number; purpose: string },
  ) {
    return this.facultyWorkspaces.requestFunding(
      guideId,
      req.user.user_id,
      this.resolveTenantId(req.user),
      body.amount,
      body.purpose,
    );
  }

  @Get('faculty/workspaces/projects')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  listProjects(@Req() req: { user: AuthUser }) {
    return this.facultyWorkspaces.listProjectGuides(
      req.user.user_id,
      this.resolveTenantId(req.user),
    );
  }

  @Get('faculty/workspaces/projects/:guideId/reports')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  listProjectReports(
    @Param('guideId') guideId: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.facultyWorkspaces.listProjectReports(
      guideId,
      req.user.user_id,
      this.resolveTenantId(req.user),
    );
  }

  @Get('hod/funding-requests')
  @Roles('HOD', 'Dean', 'SuperAdmin')
  listHodFundingRequests(@Req() req: { user: AuthUser }) {
    return this.facultyWorkspaces.listHodFundingRequests(
      req.user.user_id,
      this.resolveTenantId(req.user),
    );
  }

  @Patch('hod/funding-requests/:requestId')
  @Roles('HOD', 'Dean', 'SuperAdmin')
  updateHodFundingRequest(
    @Req() req: { user: AuthUser },
    @Param('requestId') requestId: string,
    @Body()
    body: { status: 'APPROVED_HOD' | 'REJECTED_HOD'; commitMessage: string },
  ) {
    return this.facultyWorkspaces.updateHodFundingRequest(
      requestId,
      body.status,
      body.commitMessage,
      req.user.user_id,
      this.resolveTenantId(req.user),
    );
  }

  @Get('dean/funding-requests')
  @Roles('Dean', 'SuperAdmin')
  listDeanFundingRequests(@Req() req: { user: AuthUser }) {
    return this.facultyWorkspaces.listDeanFundingRequests(
      this.resolveTenantId(req.user),
    );
  }

  @Patch('dean/funding-requests/:requestId')
  @Roles('Dean', 'SuperAdmin')
  updateDeanFundingRequest(
    @Req() req: { user: AuthUser },
    @Param('requestId') requestId: string,
    @Body()
    body: { status: 'APPROVED_DEAN' | 'REJECTED_DEAN'; commitMessage: string },
  ) {
    return this.facultyWorkspaces.updateDeanFundingRequest(
      requestId,
      body.status,
      body.commitMessage,
      req.user.user_id,
      this.resolveTenantId(req.user),
    );
  }

  @Post('faculty/workspaces/projects/reports/:reportId/review')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  reviewProjectReport(
    @Param('reportId') reportId: string,
    @Req() req: { user: AuthUser },
    @Body() body: Record<string, unknown>,
  ) {
    return this.facultyWorkspaces.reviewProjectReport(
      reportId,
      req.user.user_id,
      this.resolveTenantId(req.user),
      body as Parameters<FacultyWorkspacesService['reviewProjectReport']>[3],
    );
  }

  @Get('faculty/workspaces/analytics')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  facultyAnalytics(
    @Req() req: { user: AuthUser },
    @Query('courseId') courseId?: string,
  ) {
    return this.facultyWorkspaces.getStudentAnalytics(
      req.user.user_id,
      this.resolveTenantId(req.user),
      courseId,
    );
  }

  @Get('faculty/workspaces/analytics/students')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  searchAnalyticsStudents(
    @Req() req: { user: AuthUser },
    @Query('courseId') courseId: string,
    @Query('q') q?: string,
  ) {
    return this.facultyWorkspaces.searchFacultySubjectStudents(
      req.user.user_id,
      this.resolveTenantId(req.user),
      courseId,
      q,
    );
  }

  @Get('faculty/workspaces/analytics/students/:studentUserId/report')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  facultySubjectStudentReport(
    @Req() req: { user: AuthUser },
    @Param('studentUserId') studentUserId: string,
    @Query('courseId') courseId: string,
  ) {
    return this.facultyWorkspaces.getFacultySubjectStudentReport(
      req.user.user_id,
      this.resolveTenantId(req.user),
      courseId,
      studentUserId,
    );
  }

  @Get('faculty/workspaces/logbook')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  listLogbook(
    @Req() req: { user: AuthUser },
    @Query('courseId') courseId?: string,
  ) {
    return this.facultyWorkspaces.listLogbook(
      req.user.user_id,
      this.resolveTenantId(req.user),
      courseId,
    );
  }

  @Post('faculty/workspaces/logbook')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  createLogbook(
    @Req() req: { user: AuthUser },
    @Body() body: Record<string, unknown>,
  ) {
    return this.facultyWorkspaces.createLogbookEntry(
      req.user.user_id,
      this.resolveTenantId(req.user),
      body as Parameters<FacultyWorkspacesService['createLogbookEntry']>[2],
    );
  }

  @Get('faculty/workspaces/remedial')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  listRemedial(@Req() req: { user: AuthUser }) {
    return this.facultyWorkspaces.listRemedialActions(
      req.user.user_id,
      this.resolveTenantId(req.user),
    );
  }

  @Post('faculty/workspaces/remedial')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  createRemedial(
    @Req() req: { user: AuthUser },
    @Body() body: Record<string, unknown>,
  ) {
    return this.facultyWorkspaces.createRemedialAction(
      req.user.user_id,
      this.resolveTenantId(req.user),
      body as Parameters<FacultyWorkspacesService['createRemedialAction']>[2],
    );
  }

  @Get('faculty/workspaces/lesson-plan')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  getLessonPlan(
    @Req() req: { user: AuthUser },
    @Query('courseId') courseId: string,
  ) {
    return this.facultyWorkspaces.getLessonPlan(
      req.user.user_id,
      this.resolveTenantId(req.user),
      courseId,
    );
  }

  @Post('faculty/workspaces/lesson-plan')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  upsertLessonPlan(
    @Req() req: { user: AuthUser },
    @Body() body: Record<string, unknown>,
  ) {
    return this.facultyWorkspaces.upsertLessonPlan(
      req.user.user_id,
      this.resolveTenantId(req.user),
      body as Parameters<FacultyWorkspacesService['upsertLessonPlan']>[2],
    );
  }

  @Get('faculty/courses/:courseId/workspace')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  facultyCourseWorkspace(
    @Param('courseId') courseId: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.courseLms.getFacultyWorkspace(
      req.user.user_id,
      this.resolveTenantId(req.user),
      courseId,
    );
  }

  @Post('faculty/courses/:courseId/syllabus')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  setupSyllabus(
    @Param('courseId') courseId: string,
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      modules: { module_number: number; title: string; description?: string }[];
    },
  ) {
    return this.courseLms.setupSyllabus(
      req.user.user_id,
      this.resolveTenantId(req.user),
      courseId,
      body.modules ?? [],
    );
  }

  @Get('faculty/courses/:courseId/material-publish-targets')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  getMaterialPublishTargets(
    @Param('courseId') courseId: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.courseLms.getMaterialPublishTargets(
      req.user.user_id,
      this.resolveTenantId(req.user),
      courseId,
    );
  }

  @Post('faculty/courses/:courseId/syllabus-material')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  @UseInterceptors(courseMaterialInterceptor())
  uploadCourseSyllabusMaterial(
    @Param('courseId') courseId: string,
    @Req() req: { user: AuthUser },
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { title?: string; allocation_ids?: string | string[] },
  ) {
    return this.courseLms.uploadCourseSyllabus(
      req.user.user_id,
      this.resolveTenantId(req.user),
      courseId,
      file,
      body,
    );
  }

  @Patch('faculty/courses/modules/:moduleId/status')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  patchModuleStatus(
    @Param('moduleId') moduleId: string,
    @Req() req: { user: AuthUser },
    @Body('status') status: 'IN_PROGRESS' | 'PENDING',
  ) {
    return this.courseLms.setModuleStatus(
      req.user.user_id,
      this.resolveTenantId(req.user),
      moduleId,
      status,
    );
  }

  @Post('faculty/courses/:courseId/modules')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  addCourseModule(
    @Param('courseId') courseId: string,
    @Req() req: { user: AuthUser },
    @Body() body: { title?: string; module_number?: number },
  ) {
    return this.courseLms.addModule(
      req.user.user_id,
      this.resolveTenantId(req.user),
      courseId,
      { title: body.title ?? '', module_number: body.module_number },
    );
  }

  @Delete('faculty/courses/materials/:materialId')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  deleteCourseMaterial(
    @Param('materialId') materialId: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.courseLms.deleteCourseMaterial(
      req.user.user_id,
      this.resolveTenantId(req.user),
      materialId,
    );
  }

  @Post('faculty/courses/modules/:moduleId/materials')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  @UseInterceptors(courseMaterialsInterceptor())
  uploadModuleMaterial(
    @Param('moduleId') moduleId: string,
    @Req() req: { user: AuthUser },
    @UploadedFiles() files: Express.Multer.File[],
    @Body()
    body: {
      title?: string;
      material_type?: string;
      allocation_ids?: string | string[];
    },
  ) {
    return this.courseLms.uploadModuleMaterials(
      req.user.user_id,
      this.resolveTenantId(req.user),
      moduleId,
      files,
      body,
    );
  }

  @Post('faculty/courses/modules/:moduleId/complete')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  @UseInterceptors(courseMaterialInterceptor())
  completeModule(
    @Param('moduleId') moduleId: string,
    @Req() req: { user: AuthUser },
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: {
      title?: string;
      material_type?: string;
      allocation_ids?: string | string[];
    },
  ) {
    return this.courseLms.completeModuleWithUpload(
      req.user.user_id,
      this.resolveTenantId(req.user),
      moduleId,
      file,
      body,
    );
  }

  @Get('student/courses/:courseId/workspace')
  @Roles('Student')
  studentCourseWorkspace(
    @Param('courseId') courseId: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.courseLms.getStudentWorkspace(
      req.user.user_id,
      this.resolveTenantId(req.user),
      courseId,
    );
  }

  @Get('student/courses/materials/:materialId/download')
  @Roles('Student')
  async downloadCourseMaterial(
    @Param('materialId') materialId: string,
    @Req() req: { user: AuthUser },
    @Res() res: Response,
  ) {
    const material = await this.courseLms.getMaterialForStudentDownload(
      req.user.user_id,
      this.resolveTenantId(req.user),
      materialId,
    );
    const file = await this.courseLms.streamMaterialDownload(material);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    return file.stream.pipe(res);
  }

  @Get('student/assignments/:assignmentId/download')
  @Roles('Student')
  async downloadStudentAssignment(
    @Param('assignmentId') assignmentId: string,
    @Req() req: { user: AuthUser },
    @Res() res: Response,
  ) {
    const assignment = await this.assignments.getAssignmentForStudentDownload(
      req.user.user_id,
      this.resolveTenantId(req.user),
      assignmentId,
    );
    const file = await this.assignments.streamAssignmentFile(assignment);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    return file.stream.pipe(res);
  }

  @Get('marks/history')
  @Roles('Student')
  getMarksHistory(@Req() req: { user: AuthUser }) {
    return this.marksHistoryService.getHistory(
      this.resolveTenantId(req.user),
      req.user.user_id,
    );
  }

  @Get('marksheet/download/:semester')
  @Roles('Student')
  async downloadMarksheet(
    @Param('semester', ParseIntPipe) semester: number,
    @Query('type') type: 'provisional' | 'final' | undefined,
    @Req() req: { user: AuthUser },
    @Res() res: Response,
  ) {
    const marksheetType = type === 'final' ? 'final' : 'provisional';
    const pdf = await this.marksheetPdf.generate(
      req.user.user_id,
      this.resolveTenantId(req.user),
      semester,
      marksheetType,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${marksheetType}-marksheet-sem${semester}.pdf"`,
    );
    res.send(pdf);
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

  private async resolveFacultyDeptId(
    req: { user: AuthUser },
    deptIdRaw?: string,
  ): Promise<number | null> {
    const deptId = this.teachingDepartments.resolveOptionalDeptId(deptIdRaw);
    if (deptId != null) {
      await this.teachingDepartments.assertTeachesInDepartment(
        req.user.user_id,
        this.resolveTenantId(req.user),
        deptId,
      );
    }
    return deptId;
  }
}
