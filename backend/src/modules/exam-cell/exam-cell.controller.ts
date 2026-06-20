import { Body, Controller, Get, Post, Query, Req, UseGuards, Delete, Param, BadRequestException } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ExamCellService } from './exam-cell.service';
import {
  AssignReEvaluationDto,
  RejectReEvaluationDto,
} from './dto/re-evaluations.dto';
import {
  ConfigureSessionRulesDto,
  CreateResultSessionDto,
  DeclareResultSessionDto,
  OpenResultEntryDto,
  ReopenResultEntryDto,
} from './dto/result-control.dto';
import { ResultControlService } from './result-control.service';
import { SemesterResultsService } from './semester-results.service';

type AuthUser = { user_id: string; tenant_id?: string };

@Controller('api/exam-cell')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ExamCell', 'SuperAdmin')
export class ExamCellController {
  constructor(
    private readonly examCell: ExamCellService,
    private readonly resultControl: ResultControlService,
    private readonly semesterResults: SemesterResultsService,
  ) {}

  @Get('dashboard')
  dashboard(@Req() req: { user: AuthUser }) {
    return this.examCell.dashboard(this.tenant(req));
  }

  @Get('schedules')
  schedules(@Req() req: { user: AuthUser }) {
    return this.examCell.listSchedules(this.tenant(req));
  }

  @Post('schedules')
  createSchedule(@Req() req: { user: AuthUser }, @Body() dto: Record<string, unknown>) {
    return this.examCell.createSchedule(this.tenant(req), dto as Parameters<ExamCellService['createSchedule']>[1]);
  }

  @Post('admit-cards/generate')
  generateAdmitCards(@Req() req: { user: AuthUser }, @Body() dto: { batch_label: string; semester?: number }) {
    return this.examCell.generateAdmitCards(this.tenant(req), dto, req.user.user_id);
  }

  @Get('admit-cards/runs')
  admitCardRuns(@Req() req: { user: AuthUser }) {
    return this.examCell.listAdmitCardRuns(this.tenant(req));
  }

  @Post('seating/auto-allocate')
  autoAllocate(@Req() req: { user: AuthUser }, @Body() dto: { allocation_strategy: string; exam_type?: string; exam_schedule_id?: string; semester: number; branch?: string; rooms: string[] }) {
    return this.examCell.autoAllocateSeating(this.tenant(req), dto);
  }

  @Get('branches')
  getBranches(@Req() req: { user: AuthUser }, @Query('semester') semester: string) {
    return this.examCell.getBranchesBySemester(this.tenant(req), Number(semester));
  }

  @Get('blocks-halls')
  getBlocksHalls(@Req() req: { user: AuthUser }) {
    return this.examCell.getBlocksAndHalls(this.tenant(req));
  }

  @Get('seating-allocations')
  seatingAllocations(@Req() req: { user: AuthUser }, @Query('exam_schedule_id') examScheduleId?: string) {
    return this.examCell.listSeatingAllocations(this.tenant(req), examScheduleId);
  }

  @Get('seating-runs')
  getSeatingRuns(@Req() req: { user: AuthUser }) {
    return this.examCell.listSeatingRuns(this.tenant(req));
  }

  @Delete('seating-runs/:id')
  deleteSeatingRun(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.examCell.deleteSeatingRun(this.tenant(req), id);
  }

  @Get('seating-plans')
  seatingPlans() {
    return this.examCell.listSeatingPlans();
  }

  @Get('invigilation')
  invigilation(@Req() req: { user: AuthUser }) {
    return this.examCell.listInvigilationDuties(this.tenant(req));
  }

  @Post('invigilation/assign')
  assignInvigilation(@Req() req: { user: AuthUser }, @Body() dto: { exam_schedule_id: string; room: string; faculty_user_id: string }) {
    return this.examCell.assignInvigilation(this.tenant(req), dto);
  }

  @Post('invigilation/publish')
  publishInvigilation(@Req() req: { user: AuthUser }, @Body() dto: { exam_schedule_id: string }) {
    return this.examCell.publishInvigilationRoster(this.tenant(req), dto.exam_schedule_id);
  }

  @Get('invigilation-requests')
  invigilationRequests(@Req() req: { user: AuthUser }) {
    return this.examCell.listInvigilationRequests(this.tenant(req));
  }

  @Post('invigilation-requests/:requestId/resolve')
  resolveInvigilationRequest(
    @Req() req: { user: AuthUser },
    @Param('requestId') requestId: string,
    @Body() dto: { status: 'APPROVED' | 'REJECTED'; comment: string }
  ) {
    if (!dto.comment?.trim()) throw new BadRequestException('Comment is required');
    return this.examCell.resolveInvigilationRequest(this.tenant(req), requestId, dto.status, dto.comment);
  }

  @Get('faculty-roster')
  getFacultyRoster(@Req() req: { user: AuthUser }, @Query('date') date?: string) {
    return this.examCell.listFacultyForInvigilation(this.tenant(req), date);
  }

  @Get('results/pending')
  pendingResults(@Req() req: { user: AuthUser }) {
    return this.examCell.listPendingCoeMarks(this.tenant(req));
  }

  @Get('grades-aggregate/courses')
  getGradesAggregateCourses(@Req() req: { user: AuthUser }, @Query('semester') semester: string) {
    return this.examCell.getGradesAggregateCourses(this.tenant(req), Number(semester));
  }

  @Get('grades-aggregate/table')
  getGradesAggregateTable(
    @Req() req: { user: AuthUser },
    @Query('semester') semester: string,
    @Query('course_id') courseId: string,
  ) {
    return this.examCell.getGradesAggregateTable(this.tenant(req), Number(semester), courseId);
  }

  @Get('results/distribution')
  distribution(
    @Req() req: { user: AuthUser },
    @Query('course_id') courseId: string,
    @Query('exam_type') examType: string,
  ) {
    return this.examCell.marksDistribution(this.tenant(req), courseId, examType);
  }

  @Post('results/publish')
  publishResults(
    @Req() req: { user: AuthUser },
    @Body() dto: { course_id: string; exam_type: string; batch_semester?: number },
  ) {
    return this.examCell.publishResults(this.tenant(req), dto);
  }

  @Get('re-evaluations')
  reEvaluations() {
    return this.examCell.listReEvaluations();
  }

  @Get('re-evaluations/:applicationId')
  reEvaluationDetail(@Param('applicationId') applicationId: string) {
    return this.examCell.getReEvaluation(applicationId);
  }

  @Post('re-evaluations/:applicationId/assign')
  assignReEvaluation(
    @Req() req: { user: AuthUser },
    @Param('applicationId') applicationId: string,
    @Body() dto: AssignReEvaluationDto,
  ) {
    return this.examCell.assignReEvaluation(
      this.tenant(req),
      req.user.user_id,
      applicationId,
      dto.faculty_user_id,
    );
  }

  @Post('re-evaluations/:applicationId/publish')
  publishReEvaluation(@Req() req: { user: AuthUser }, @Param('applicationId') applicationId: string) {
    return this.examCell.publishReEvaluation(this.tenant(req), req.user.user_id, applicationId);
  }

  @Post('re-evaluations/:applicationId/reject')
  rejectReEvaluation(
    @Req() req: { user: AuthUser },
    @Param('applicationId') applicationId: string,
    @Body() dto: RejectReEvaluationDto,
  ) {
    return this.examCell.rejectReEvaluation(
      this.tenant(req),
      req.user.user_id,
      applicationId,
      dto.reason,
    );
  }

  @Get('grade-cards')
  gradeCards(@Req() req: { user: AuthUser }, @Query('semester') semester?: string) {
    return this.semesterResults.listGradeCards(this.tenant(req), semester ? Number(semester) : undefined);
  }

  @Post('grade-cards/generate')
  generateGradeCards(@Req() req: { user: AuthUser }, @Body() dto: { semester: number }) {
    return this.semesterResults.generateGradeCards(this.tenant(req), Number(dto.semester));
  }

  @Post('grade-cards/publish-provisional')
  publishProvisionalGradeCards(@Req() req: { user: AuthUser }, @Body() dto: { semester: number }) {
    return this.semesterResults.publishProvisional(this.tenant(req), Number(dto.semester));
  }

  @Post('grade-cards/finalize')
  finalizeGradeCards(@Req() req: { user: AuthUser }, @Body() dto: { semester: number }) {
    return this.semesterResults.finalize(this.tenant(req), Number(dto.semester));
  }

  @Get('grade-cards/top-students')
  topStudents(
    @Req() req: { user: AuthUser },
    @Query('semester') semester: string,
    @Query('limit') limit?: string,
  ) {
    return this.semesterResults.topStudents(this.tenant(req), Number(semester), limit ? Number(limit) : 10);
  }

  @Get('ufm-cases')
  ufmCases() {
    return this.examCell.listUfmCases();
  }

  @Get('ufm-cases/form-options')
  ufmFormOptions(@Req() req: { user: AuthUser }) {
    return this.examCell.listUfmFormOptions(this.tenant(req));
  }

  @Post('ufm-cases')
  createUfmCase(@Req() req: { user: AuthUser }, @Body() dto: Record<string, unknown>) {
    return this.examCell.createUfmCase(this.tenant(req), {
      ...(dto as Parameters<ExamCellService['createUfmCase']>[1]),
      reported_by: req.user.user_id,
    });
  }

  @Post('transcripts/generate')
  transcripts(@Req() req: { user: AuthUser }, @Body() dto: { semester: number }) {
    return this.examCell.generateTranscripts(this.tenant(req), dto.semester);
  }

  @Get('result-control/sessions')
  listResultSessions(@Req() req: { user: AuthUser }) {
    return this.resultControl.listSessions(this.tenant(req));
  }

  @Post('result-control/sessions')
  createResultSession(@Req() req: { user: AuthUser }, @Body() dto: CreateResultSessionDto) {
    return this.resultControl.createSession(this.tenant(req), dto);
  }

  @Get('result-control/sessions/:sessionId')
  getResultSession(@Req() req: { user: AuthUser }, @Param('sessionId') sessionId: string) {
    return this.resultControl.getSession(this.tenant(req), sessionId);
  }

  @Post('result-control/sessions/:sessionId/open-entry')
  openResultEntry(
    @Req() req: { user: AuthUser },
    @Param('sessionId') sessionId: string,
    @Body() dto: OpenResultEntryDto,
  ) {
    return this.resultControl.openEntry(this.tenant(req), sessionId, dto);
  }

  @Post('result-control/sessions/:sessionId/close-entry')
  closeResultEntry(@Req() req: { user: AuthUser }, @Param('sessionId') sessionId: string) {
    return this.resultControl.closeEntry(this.tenant(req), sessionId);
  }

  @Post('result-control/sessions/:sessionId/lock-marks')
  lockResultMarks(@Req() req: { user: AuthUser }, @Param('sessionId') sessionId: string) {
    return this.resultControl.lockMarks(this.tenant(req), sessionId, req.user.user_id);
  }

  @Post('result-control/sessions/:sessionId/prepare-declaration')
  prepareResultDeclaration(@Req() req: { user: AuthUser }, @Param('sessionId') sessionId: string) {
    return this.resultControl.prepareForDeclaration(this.tenant(req), sessionId, req.user.user_id);
  }

  @Post('result-control/sessions/:sessionId/reopen-entry')
  reopenResultEntry(
    @Req() req: { user: AuthUser },
    @Param('sessionId') sessionId: string,
    @Body() dto: ReopenResultEntryDto,
  ) {
    return this.resultControl.reopenEntry(this.tenant(req), sessionId, dto);
  }

  @Post('result-control/sessions/:sessionId/configure-rules')
  configureResultRules(
    @Req() req: { user: AuthUser },
    @Param('sessionId') sessionId: string,
    @Body() dto: ConfigureSessionRulesDto,
  ) {
    return this.resultControl.configureRules(this.tenant(req), sessionId, dto);
  }

  @Get('result-control/courses')
  listResultCourses(@Req() req: { user: AuthUser }) {
    return this.resultControl.listCourses(this.tenant(req));
  }

  @Get('result-control/grading-policies')
  listGradingPolicies() {
    return this.resultControl.listGradingPolicies();
  }

  @Post('result-control/sessions/:sessionId/process')
  processResultSession(@Req() req: { user: AuthUser }, @Param('sessionId') sessionId: string) {
    return this.resultControl.processSession(this.tenant(req), sessionId, req.user.user_id);
  }

  @Post('result-control/sessions/:sessionId/declare')
  declareResultSession(
    @Req() req: { user: AuthUser },
    @Param('sessionId') sessionId: string,
    @Body() dto: DeclareResultSessionDto,
  ) {
    return this.resultControl.declareSession(this.tenant(req), sessionId, req.user.user_id, dto);
  }

  @Get('result-control/sessions/:sessionId/reports')
  listSessionReports(@Req() req: { user: AuthUser }, @Param('sessionId') sessionId: string) {
    return this.resultControl.listSessionReports(this.tenant(req), sessionId);
  }

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }
}
