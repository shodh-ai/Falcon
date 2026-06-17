import {
  Body,
  Controller,
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
} from '@nestjs/common';
import type { Response } from 'express';
import {
  assignmentPdfInterceptor,
  assignmentReferencePdfInterceptor,
  courseMaterialInterceptor,
  courseMaterialsInterceptor,
} from './lms-upload.config';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AcademicsService } from './academics.service';
import { AcademicsFacultyService } from './academics-faculty.service';
import { AssignmentsService } from './assignments.service';
import { FacultyWorkspacesService } from './faculty-workspaces.service';
import { CourseLmsService } from './course-lms.service';
import { MarksheetPdfService } from './pdf/marksheet-pdf.service';
import { MarksHistoryService } from './marks-history.service';
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
    private readonly facultyWorkspaces: FacultyWorkspacesService,
    private readonly courseLms: CourseLmsService,
    private readonly marksheetPdf: MarksheetPdfService,
    private readonly marksHistoryService: MarksHistoryService,
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

  @Get('faculty/attendance/missing')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  getMissingAttendanceAlerts(@Req() req: { user: AuthUser }) {
    return this.facultyAcademics.getMissingAttendanceAlerts(
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

  @Get('faculty/course/:courseId/attendance/analytics')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  getFacultyCourseAttendanceAnalytics(
    @Param('courseId') courseId: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.facultyAcademics.getAttendanceAnalytics(
      courseId,
      req.user.user_id,
      this.resolveTenantId(req.user),
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
    @Body() dto: { course_id?: string; title?: string; description?: string; max_marks?: string; start_date?: string; due_date?: string },
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
    @Body() dto: { title?: string; description?: string; max_marks?: string; start_date?: string; due_date?: string },
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
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
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

  @Get('hod/command-center')
  @Roles('HOD', 'Dean', 'SuperAdmin')
  hodCommandCenter(@Req() req: { user: AuthUser }) {
    return this.academics.getHodCommandCenter(this.resolveTenantId(req.user), req.user.user_id);
  }

  @Get('hod/faculty-workload')
  @Roles('HOD', 'Dean', 'SuperAdmin')
  hodFacultyWorkload(@Req() req: { user: AuthUser }) {
    return this.academics.listHodFacultyWorkload(this.resolveTenantId(req.user), req.user.user_id);
  }

  @Get('hod/department-timetable')
  @Roles('HOD', 'Dean', 'SuperAdmin')
  hodDepartmentTimetable(@Req() req: { user: AuthUser }) {
    return this.academics.listHodDepartmentTimetable(this.resolveTenantId(req.user), req.user.user_id);
  }

  @Get('hod/course-allocation-slots')
  @Roles('HOD', 'Dean', 'SuperAdmin')
  hodCourseAllocationSlots(@Req() req: { user: AuthUser }) {
    return this.academics.listHodCourseAllocationSlots(this.resolveTenantId(req.user), req.user.user_id);
  }

  @Get('hod/syllabus-coverage')
  @Roles('HOD', 'Dean', 'SuperAdmin')
  hodSyllabusCoverage(@Req() req: { user: AuthUser }) {
    return this.academics.listHodSyllabusCoverage(this.resolveTenantId(req.user), req.user.user_id);
  }

  @Get('hod/result-analytics')
  @Roles('HOD', 'Dean', 'SuperAdmin')
  hodResultAnalytics(@Req() req: { user: AuthUser }) {
    return this.academics.listHodResultAnalytics(this.resolveTenantId(req.user), req.user.user_id);
  }

  @Get('hod/grievances')
  @Roles('HOD', 'Dean', 'SuperAdmin')
  hodGrievances(@Req() req: { user: AuthUser }) {
    return this.academics.listHodGrievances(this.resolveTenantId(req.user), req.user.user_id);
  }

  @Get('hod/slow-learners')
  @Roles('HOD', 'Dean', 'SuperAdmin')
  hodSlowLearners(@Req() req: { user: AuthUser }) {
    return this.academics.listHodSlowLearners(this.resolveTenantId(req.user), req.user.user_id);
  }

  @Get('hod/appraisals')
  @Roles('HOD', 'Dean', 'SuperAdmin')
  hodAppraisals(@Req() req: { user: AuthUser }) {
    return this.academics.listHodAppraisals(this.resolveTenantId(req.user), req.user.user_id);
  }

  @Patch('hod/appraisals/:appraisalId/rating')
  @Roles('HOD', 'Dean', 'SuperAdmin')
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
    return this.academics.updateTimetableSlot(this.resolveTenantId(req.user), timetableId, dto);
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

  @Get('hod/student-monitor/:studentId/detail')
  @Roles('HOD', 'Dean', 'SuperAdmin')
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
  @Roles('HOD', 'Dean', 'SuperAdmin')
  hodLeaveApprovals(@Req() req: { user: AuthUser }) {
    return this.academics.listHodLeaveApprovals(this.resolveTenantId(req.user), req.user.user_id);
  }

  @Get('hod/approvals/gate-passes')
  @Roles('HOD', 'Dean', 'SuperAdmin')
  hodGatePassApprovals(@Req() req: { user: AuthUser }) {
    return this.academics.listHodGatePassApprovals(this.resolveTenantId(req.user), req.user.user_id);
  }

  @Get('hod/approvals/extra-classes')
  @Roles('HOD', 'Dean', 'SuperAdmin')
  hodExtraClassApprovals(@Req() req: { user: AuthUser }) {
    return this.facultyWorkspaces.listHodPendingAdjustments(
      req.user.user_id,
      this.resolveTenantId(req.user),
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
  facultyWorkspaceCourses(@Req() req: { user: AuthUser }) {
    return this.facultyWorkspaces.listFacultyCourses(req.user.user_id, this.resolveTenantId(req.user));
  }

  @Get('faculty/workspaces/timetable')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  facultyWorkspaceTimetable(@Req() req: { user: AuthUser }) {
    return this.facultyWorkspaces.getWeeklyTimetable(req.user.user_id, this.resolveTenantId(req.user));
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
  saveMarksDraft(@Req() req: { user: AuthUser }, @Body() body: Record<string, unknown>) {
    return this.facultyWorkspaces.saveMarksDraft(
      req.user.user_id,
      this.resolveTenantId(req.user),
      body as Parameters<FacultyWorkspacesService['saveMarksDraft']>[2],
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

  @Get('faculty/workspaces/copo')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  listCoPo(@Req() req: { user: AuthUser }, @Query('courseId') courseId: string) {
    return this.facultyWorkspaces.listCoPoMappings(this.resolveTenantId(req.user), courseId);
  }

  @Post('faculty/workspaces/copo')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  upsertCoPo(@Req() req: { user: AuthUser }, @Body() body: Record<string, unknown>) {
    return this.facultyWorkspaces.upsertCoPoMapping(
      req.user.user_id,
      this.resolveTenantId(req.user),
      body as Parameters<FacultyWorkspacesService['upsertCoPoMapping']>[2],
    );
  }

  @Get('faculty/workspaces/adjustments')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  listAdjustments(@Req() req: { user: AuthUser }) {
    return this.facultyWorkspaces.listClassAdjustments(req.user.user_id, this.resolveTenantId(req.user));
  }

  @Post('faculty/workspaces/adjustments')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  createAdjustment(@Req() req: { user: AuthUser }, @Body() body: Record<string, unknown>) {
    return this.facultyWorkspaces.createClassAdjustment(
      req.user.user_id,
      this.resolveTenantId(req.user),
      body as Parameters<FacultyWorkspacesService['createClassAdjustment']>[2],
    );
  }

  @Get('faculty/workspaces/research')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  listResearch(@Req() req: { user: AuthUser }) {
    return this.facultyWorkspaces.listResearchLogs(req.user.user_id, this.resolveTenantId(req.user));
  }

  @Post('faculty/workspaces/research')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  createResearch(@Req() req: { user: AuthUser }, @Body() body: Record<string, unknown>) {
    return this.facultyWorkspaces.createResearchLog(
      req.user.user_id,
      this.resolveTenantId(req.user),
      body as Parameters<FacultyWorkspacesService['createResearchLog']>[2],
    );
  }

  @Get('faculty/workspaces/invigilation')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  listInvigilation(@Req() req: { user: AuthUser }) {
    return this.facultyWorkspaces.listInvigilation(req.user.user_id, this.resolveTenantId(req.user));
  }

  @Get('faculty/workspaces/projects')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  listProjects(@Req() req: { user: AuthUser }) {
    return this.facultyWorkspaces.listProjectGuides(req.user.user_id, this.resolveTenantId(req.user));
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
  facultyAnalytics(@Req() req: { user: AuthUser }, @Query('courseId') courseId?: string) {
    return this.facultyWorkspaces.getStudentAnalytics(
      req.user.user_id,
      this.resolveTenantId(req.user),
      courseId,
    );
  }

  @Get('faculty/workspaces/logbook')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  listLogbook(@Req() req: { user: AuthUser }, @Query('courseId') courseId?: string) {
    return this.facultyWorkspaces.listLogbook(req.user.user_id, this.resolveTenantId(req.user), courseId);
  }

  @Post('faculty/workspaces/logbook')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  createLogbook(@Req() req: { user: AuthUser }, @Body() body: Record<string, unknown>) {
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
  createRemedial(@Req() req: { user: AuthUser }, @Body() body: Record<string, unknown>) {
    return this.facultyWorkspaces.createRemedialAction(
      req.user.user_id,
      this.resolveTenantId(req.user),
      body as Parameters<FacultyWorkspacesService['createRemedialAction']>[2],
    );
  }

  @Get('faculty/workspaces/lesson-plan')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  getLessonPlan(@Req() req: { user: AuthUser }, @Query('courseId') courseId: string) {
    return this.facultyWorkspaces.getLessonPlan(req.user.user_id, this.resolveTenantId(req.user), courseId);
  }

  @Post('faculty/workspaces/lesson-plan')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  upsertLessonPlan(@Req() req: { user: AuthUser }, @Body() body: Record<string, unknown>) {
    return this.facultyWorkspaces.upsertLessonPlan(
      req.user.user_id,
      this.resolveTenantId(req.user),
      body as Parameters<FacultyWorkspacesService['upsertLessonPlan']>[2],
    );
  }

  @Get('faculty/courses/:courseId/workspace')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  facultyCourseWorkspace(@Param('courseId') courseId: string, @Req() req: { user: AuthUser }) {
    return this.courseLms.getFacultyWorkspace(req.user.user_id, this.resolveTenantId(req.user), courseId);
  }

  @Post('faculty/courses/:courseId/syllabus')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  setupSyllabus(
    @Param('courseId') courseId: string,
    @Req() req: { user: AuthUser },
    @Body() body: { modules: { module_number: number; title: string; description?: string }[] },
  ) {
    return this.courseLms.setupSyllabus(
      req.user.user_id,
      this.resolveTenantId(req.user),
      courseId,
      body.modules ?? [],
    );
  }

  @Post('faculty/courses/:courseId/syllabus-material')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  @UseInterceptors(courseMaterialInterceptor())
  uploadCourseSyllabusMaterial(
    @Param('courseId') courseId: string,
    @Req() req: { user: AuthUser },
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { title?: string },
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
    return this.courseLms.setModuleStatus(req.user.user_id, this.resolveTenantId(req.user), moduleId, status);
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

  @Post('faculty/courses/modules/:moduleId/materials')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  @UseInterceptors(courseMaterialsInterceptor())
  uploadModuleMaterial(
    @Param('moduleId') moduleId: string,
    @Req() req: { user: AuthUser },
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: { title?: string; material_type?: string },
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
    @Body() body: { title?: string; material_type?: string },
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
  studentCourseWorkspace(@Param('courseId') courseId: string, @Req() req: { user: AuthUser }) {
    return this.courseLms.getStudentWorkspace(req.user.user_id, this.resolveTenantId(req.user), courseId);
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
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    return file.stream.pipe(res);
  }

  @Get('marks/history')
  @Roles('Student')
  getMarksHistory(@Req() req: { user: AuthUser }) {
    return this.marksHistoryService.getHistory(this.resolveTenantId(req.user), req.user.user_id);
  }

  @Get('marksheet/download/:semester')
  @Roles('Student')
  async downloadMarksheet(
    @Param('semester', ParseIntPipe) semester: number,
    @Req() req: { user: AuthUser },
    @Res() res: Response,
  ) {
    const pdf = await this.marksheetPdf.generate(req.user.user_id, this.resolveTenantId(req.user), semester);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="marksheet-sem${semester}.pdf"`);
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
}
