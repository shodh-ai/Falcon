import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  Delete,
  Param,
  BadRequestException,
  ParseIntPipe,
  ParseUUIDPipe,
  StreamableFile,
  Optional,
  ServiceUnavailableException,
  UseInterceptors,
  UploadedFile,
  Header,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { QuestionPaperWorkflowService } from './question-paper-workflow.service';
import {
  CreateQuestionPaperDto,
  UpdateQuestionPaperStatusDto,
  UploadQuestionPaperDto,
} from './dto/question-paper.dto';
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
import { ExamCellAuditService } from './exam-cell-audit.service';
import { ExamCellSessionsService } from './exam-cell-sessions.service';
import { CreateExamScheduleDto } from './dto/exam-schedule.dto';
import {
  CreateExamSessionDto,
  UpdateExamSessionStatusDto,
} from './dto/exam-session.dto';
import {
  MarkExamDayAttendanceDto,
  ExamDayDateQueryDto,
  CreateAnswerSheetDto,
  UpdateAnswerSheetStatusDto,
  ReportMissingScriptDto,
  ResolveMissingScriptDto,
  ReportExamDayUfmDto,
  ReviewExamDayUfmDto,
  CorrectScriptReceiptDto,
} from './dto/exam-day.dto';
import { ExamDayScriptsService } from './exam-day-scripts.service';
import {
  CreateExamFormWindowDto,
  ReviewExamRegistrationDto,
  SyncExamRegistrationsDto,
  UpdateExamFormWindowStatusDto,
} from './dto/exam-registration.dto';
import { ExamCellOperationsService } from './exam-cell-operations.service';
import { ExamCellEnterpriseService } from './exam-cell-enterprise.service';
import { ExamCellDevService } from './exam-cell-dev.service';
import { OfficialTranscriptService } from './official-transcript.service';
import { requireTenantId } from '../../common/utils/require-tenant-id';
import { EXAM_CELL_ACCESS_ROLES } from './exam-cell.constants';
import {
  AdvanceHallTicketApprovalDto,
  BulkApproveHallTicketsDto,
} from './dto/hall-ticket-approval.dto';
import {
  assertExamCellAction,
  examCellRoleFromUser,
  type ExamCellAction,
} from './exam-cell-rbac.util';

type AuthUser = {
  user_id: string;
  tenant_id?: string;
  role?: string;
  primaryRole?: string;
};

@Controller('api/exam-cell')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...EXAM_CELL_ACCESS_ROLES)
export class ExamCellController {
  constructor(
    private readonly examCell: ExamCellService,
    private readonly resultControl: ResultControlService,
    private readonly semesterResults: SemesterResultsService,
    private readonly audit: ExamCellAuditService,
    private readonly sessions: ExamCellSessionsService,
    private readonly operations: ExamCellOperationsService,
    private readonly enterprise: ExamCellEnterpriseService,
    private readonly dev: ExamCellDevService,
    private readonly officialTranscripts: OfficialTranscriptService,
    @Optional() private readonly scripts?: ExamDayScriptsService,
    @Optional() private readonly questionPapers?: QuestionPaperWorkflowService,
  ) {}

  @Get('dashboard')
  async dashboard(@Req() req: { user: AuthUser }) {
    this.requireAction(req, 'view_dashboard');
    const tenantId = this.tenant(req);
    let recentActivityError: string | undefined;
    const [stats, recentActivity] = await Promise.all([
      this.examCell.dashboard(tenantId),
      this.audit.listRecent(tenantId, 5, { strict: true }).catch(() => {
        recentActivityError = 'Recent audit activity is unavailable.';
        return null;
      }),
    ]);
    return {
      ...stats,
      recent_activity:
        recentActivity?.map((event) => ({
          audit_id: event.audit_id,
          action: event.action,
          resource_type: event.resource_type,
          created_at: event.created_at,
          actor_name: event.actor_name,
        })) ?? null,
      ...(recentActivityError
        ? { recent_activity_error: recentActivityError }
        : {}),
    };
  }

  @Get('schedules')
  schedules(
    @Req() req: { user: AuthUser },
    @Query('session_id') sessionId?: string,
  ) {
    return this.examCell.listSchedules(this.tenant(req), sessionId);
  }

  @Post('schedules')
  createSchedule(
    @Req() req: { user: AuthUser },
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CreateExamScheduleDto,
  ) {
    this.requireAction(req, 'manage_schedules');
    return this.examCell.createSchedule(
      this.tenant(req),
      dto,
      req.user.user_id,
      examCellRoleFromUser(req.user),
    );
  }

  @Post('sessions/:sessionId/timetable/release')
  releaseSessionTimetable(
    @Req() req: { user: AuthUser },
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    this.requireAction(req, 'release_timetable');
    return this.examCell.releaseSessionTimetable(
      this.tenant(req),
      sessionId,
      req.user.user_id,
      examCellRoleFromUser(req.user),
    );
  }

  @Get('admit-cards/audit')
  auditAdmitCards(
    @Req() req: { user: AuthUser },
    @Query('session_id', new ParseUUIDPipe()) sessionId: string,
    @Query('registration_id', new ParseUUIDPipe()) registrationId: string,
  ) {
    return this.enterprise.inspectHallTicketReadiness(
      this.tenant(req),
      sessionId,
      registrationId,
      examCellRoleFromUser(req.user),
    );
  }

  @Post('admit-cards/generate')
  async generateAdmitCards(
    @Req() req: { user: AuthUser },
    @Body() dto: { batch_label: string; semester?: number },
  ) {
    this.requireAction(req, 'generate_admit_cards');
    const tenantId = this.tenant(req);
    const result = await this.examCell.generateAdmitCards(
      tenantId,
      dto,
      req.user.user_id,
    );
    await this.audit.log(tenantId, req.user.user_id, {
      action: 'ADMIT_CARDS_GENERATED',
      resource_type: 'admit_card_run',
      resource_id: result.run_id,
      new_value: { generated: result.generated, blocked: result.blocked },
    });
    return result;
  }

  @Get('admit-cards/runs')
  admitCardRuns(@Req() req: { user: AuthUser }) {
    return this.examCell.listAdmitCardRuns(this.tenant(req));
  }

  @Post('seating/auto-allocate')
  autoAllocate(
    @Req() req: { user: AuthUser },
    @Body()
    dto: {
      allocation_strategy: string;
      exam_type?: string;
      exam_schedule_id?: string;
      semester: number;
      branch?: string;
      rooms: string[];
    },
  ) {
    this.requireAction(req, 'manage_seating');
    return this.examCell.autoAllocateSeating(this.tenant(req), dto);
  }

  @Post('seating/assign-resource')
  assignResource(
    @Req() req: { user: AuthUser },
    @Body()
    dto: {
      exam_schedule_id: string;
      room: string;
      semester: number;
      coordinator_faculty_user_id?: string;
      block?: string;
    },
  ) {
    this.requireAction(req, 'manage_seating');
    return this.examCell.assignSubjectToRoom(this.tenant(req), dto);
  }

  @Post('seating/swap')
  swapSeating(
    @Req() req: { user: AuthUser },
    @Body()
    dto: {
      exam_schedule_id: string;
      room: string;
      student_user_id_a: string;
      student_user_id_b: string;
    },
  ) {
    this.requireAction(req, 'manage_seating');
    return this.examCell.swapSeatingAllocations(this.tenant(req), dto);
  }

  @Post('seating/publish-plans')
  publishSeatingPlans(
    @Req() req: { user: AuthUser },
    @Body() dto: { exam_schedule_id?: string },
  ) {
    this.requireAction(req, 'manage_seating');
    return this.examCell.publishSeatingPlans(
      this.tenant(req),
      dto.exam_schedule_id,
    );
  }

  @Get('branches')
  getBranches(
    @Req() req: { user: AuthUser },
    @Query('semester', ParseIntPipe) semester: number,
  ) {
    return this.examCell.getBranchesBySemester(this.tenant(req), semester);
  }

  @Get('blocks-halls')
  getBlocksHalls(@Req() req: { user: AuthUser }) {
    return this.examCell.getBlocksAndHalls(this.tenant(req));
  }

  @Get('seating-allocations')
  seatingAllocations(
    @Req() req: { user: AuthUser },
    @Query('exam_schedule_id') examScheduleId?: string,
  ) {
    return this.examCell.listSeatingAllocations(
      this.tenant(req),
      examScheduleId,
    );
  }

  @Get('seating-runs')
  getSeatingRuns(@Req() req: { user: AuthUser }) {
    return this.examCell.listSeatingRuns(this.tenant(req));
  }

  @Delete('seating-runs/:id')
  deleteSeatingRun(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    this.requireAction(req, 'manage_seating');
    return this.examCell.deleteSeatingRun(this.tenant(req), id);
  }

  @Get('subjects')
  scheduleSubjects() {
    return this.examCell.listScheduleSubjects();
  }

  @Get('seating-plans')
  seatingPlans(@Req() req: { user: AuthUser }) {
    return this.examCell.listSeatingPlans(this.tenant(req));
  }

  @Get('invigilation')
  invigilation(@Req() req: { user: AuthUser }) {
    return this.examCell.listInvigilationDuties(this.tenant(req));
  }

  @Post('invigilation/assign')
  assignInvigilation(
    @Req() req: { user: AuthUser },
    @Body()
    dto: {
      exam_schedule_id: string;
      room: string;
      faculty_user_id: string;
      is_coordinator?: boolean;
    },
  ) {
    this.requireAction(req, 'manage_sessions');
    return this.examCell.assignInvigilation(this.tenant(req), dto);
  }

  @Post('invigilation/publish')
  publishInvigilation(
    @Req() req: { user: AuthUser },
    @Body() dto: { exam_schedule_id: string },
  ) {
    this.requireAction(req, 'manage_sessions');
    return this.examCell.publishInvigilationRoster(
      this.tenant(req),
      dto.exam_schedule_id,
    );
  }

  @Get('invigilation-requests')
  invigilationRequests(@Req() req: { user: AuthUser }) {
    return this.examCell.listInvigilationRequests(this.tenant(req));
  }

  @Post('invigilation-requests/:requestId/resolve')
  resolveInvigilationRequest(
    @Req() req: { user: AuthUser },
    @Param('requestId') requestId: string,
    @Body() dto: { status: 'APPROVED' | 'REJECTED'; comment: string },
  ) {
    this.requireAction(req, 'manage_sessions');
    if (!dto.comment?.trim())
      throw new BadRequestException('Comment is required');
    return this.examCell.resolveInvigilationRequest(
      this.tenant(req),
      requestId,
      dto.status,
      dto.comment,
    );
  }

  @Get('invigilation-swaps')
  listInvigilationDutySwaps(@Req() req: { user: AuthUser }) {
    return this.examCell.listInvigilationDutySwaps(this.tenant(req));
  }

  @Get('invigilation-swaps/:swapId/audits')
  listInvigilationDutySwapAudits(
    @Req() req: { user: AuthUser },
    @Param('swapId') swapId: string,
  ) {
    return this.examCell.listInvigilationDutySwapAudits(
      this.tenant(req),
      swapId,
    );
  }

  @Post('invigilation-swaps/:swapId/resolve')
  resolveInvigilationDutySwap(
    @Req() req: { user: AuthUser },
    @Param('swapId') swapId: string,
    @Body() dto: { status: 'APPROVED' | 'REJECTED'; comment: string },
  ) {
    this.requireAction(req, 'manage_sessions');
    if (!dto.comment?.trim())
      throw new BadRequestException('Comment is required');
    if (dto.status !== 'APPROVED' && dto.status !== 'REJECTED') {
      throw new BadRequestException('status must be APPROVED or REJECTED');
    }
    return this.examCell.resolveInvigilationDutySwap(
      this.tenant(req),
      swapId,
      req.user.user_id,
      dto.status,
      dto.comment,
    );
  }

  @Get('faculty-roster')
  getFacultyRoster(
    @Req() req: { user: AuthUser },
    @Query('date') date?: string,
  ) {
    return this.examCell.listFacultyForInvigilation(this.tenant(req), date);
  }

  @Get('results/pending')
  pendingResults(@Req() req: { user: AuthUser }) {
    return this.examCell.listPendingCoeMarks(this.tenant(req));
  }

  @Get('grades-aggregate/courses')
  getGradesAggregateCourses(
    @Req() req: { user: AuthUser },
    @Query('semester') semester: string,
  ) {
    const parsedSemester = Number(semester);
    if (!Number.isInteger(parsedSemester) || parsedSemester < 1) {
      throw new BadRequestException('semester must be a positive integer');
    }
    return this.examCell.getGradesAggregateCourses(
      this.tenant(req),
      parsedSemester,
    );
  }

  @Get('grades-aggregate/table')
  getGradesAggregateTable(
    @Req() req: { user: AuthUser },
    @Query('semester') semester: string,
    @Query('course_id') courseId: string,
  ) {
    const parsedSemester = Number(semester);
    if (!Number.isInteger(parsedSemester) || parsedSemester < 1) {
      throw new BadRequestException('semester must be a positive integer');
    }
    if (!courseId?.trim()) {
      throw new BadRequestException('course_id is required');
    }
    return this.examCell.getGradesAggregateTable(
      this.tenant(req),
      parsedSemester,
      courseId,
    );
  }

  @Get('results/distribution')
  distribution(
    @Req() req: { user: AuthUser },
    @Query('course_id') courseId: string,
    @Query('exam_type') examType: string,
  ) {
    return this.examCell.marksDistribution(
      this.tenant(req),
      courseId,
      examType,
    );
  }

  @Post('results/publish')
  publishResults(
    @Req() req: { user: AuthUser },
    @Body()
    dto: { course_id: string; exam_type: string; batch_semester?: number },
  ) {
    this.requireAction(req, 'publish_results');
    return this.examCell.publishResults(
      this.tenant(req),
      dto,
      req.user.user_id,
    );
  }

  @Get('re-evaluations')
  reEvaluations(@Req() req: { user: AuthUser }) {
    return this.examCell.listReEvaluations(this.tenant(req));
  }

  @Get('re-evaluations/:applicationId')
  reEvaluationDetail(
    @Req() req: { user: AuthUser },
    @Param('applicationId') applicationId: string,
  ) {
    return this.examCell.getReEvaluation(this.tenant(req), applicationId);
  }

  @Post('re-evaluations/:applicationId/assign')
  assignReEvaluation(
    @Req() req: { user: AuthUser },
    @Param('applicationId') applicationId: string,
    @Body() dto: AssignReEvaluationDto,
  ) {
    this.requireAction(req, 'publish_results');
    return this.examCell.assignReEvaluation(
      this.tenant(req),
      req.user.user_id,
      applicationId,
      dto.faculty_user_id,
    );
  }

  @Post('re-evaluations/:applicationId/publish')
  publishReEvaluation(
    @Req() req: { user: AuthUser },
    @Param('applicationId') applicationId: string,
  ) {
    this.requireAction(req, 'publish_results');
    return this.examCell.publishReEvaluation(
      this.tenant(req),
      req.user.user_id,
      applicationId,
    );
  }

  @Post('re-evaluations/:applicationId/reject')
  rejectReEvaluation(
    @Req() req: { user: AuthUser },
    @Param('applicationId') applicationId: string,
    @Body() dto: RejectReEvaluationDto,
  ) {
    this.requireAction(req, 'publish_results');
    return this.examCell.rejectReEvaluation(
      this.tenant(req),
      req.user.user_id,
      applicationId,
      dto.reason,
    );
  }

  @Get('grade-cards')
  gradeCards(
    @Req() req: { user: AuthUser },
    @Query('semester') semester?: string,
  ) {
    return this.semesterResults.listGradeCards(
      this.tenant(req),
      semester ? Number(semester) : undefined,
    );
  }

  @Post('grade-cards/generate')
  generateGradeCards(
    @Req() req: { user: AuthUser },
    @Body() dto: { semester: number },
  ) {
    this.requireAction(req, 'manage_sessions');
    return this.semesterResults.generateGradeCards(
      this.tenant(req),
      Number(dto.semester),
    );
  }

  @Post('grade-cards/publish-provisional')
  publishProvisionalGradeCards(
    @Req() req: { user: AuthUser },
    @Body() dto: { semester: number },
  ) {
    this.requireAction(req, 'publish_results');
    return this.semesterResults.publishProvisional(
      this.tenant(req),
      Number(dto.semester),
    );
  }

  @Post('grade-cards/finalize')
  finalizeGradeCards(
    @Req() req: { user: AuthUser },
    @Body() dto: { semester: number },
  ) {
    this.requireAction(req, 'publish_results');
    return this.semesterResults.finalize(
      this.tenant(req),
      Number(dto.semester),
    );
  }

  @Get('grade-cards/top-students')
  topStudents(
    @Req() req: { user: AuthUser },
    @Query('semester') semester: string,
    @Query('limit') limit?: string,
  ) {
    const parsedSemester = Number(semester);
    const parsedLimit = limit === undefined ? 10 : Number(limit);
    if (!Number.isInteger(parsedSemester) || parsedSemester < 1) {
      throw new BadRequestException('semester must be a positive integer');
    }
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw new BadRequestException('limit must be an integer between 1 and 100');
    }
    return this.semesterResults.topStudents(
      this.tenant(req),
      parsedSemester,
      parsedLimit,
    );
  }

  @Get('grade-cards/:gradeCardId/export/pdf')
  async exportGradeCardPdf(
    @Req() req: { user: AuthUser },
    @Param('gradeCardId') gradeCardId: string,
  ) {
    const file = await this.semesterResults.exportGradeCardPdf(
      this.tenant(req),
      gradeCardId,
    );
    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: `attachment; filename="${file.filename}"`,
    });
  }

  @Get('ufm-cases')
  ufmCases(
    @Req() req: { user: AuthUser },
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.examCell.listUfmCases(this.tenant(req), {
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
    });
  }

  @Get('ufm-cases/form-options')
  ufmFormOptions(
    @Req() req: { user: AuthUser },
    @Query('semester') semester?: string,
    @Query('department') department?: string,
  ) {
    return this.examCell.listUfmFormOptions(this.tenant(req), {
      semester: semester ? Number(semester) : undefined,
      department: department || undefined,
    });
  }

  @Post('ufm-cases')
  createUfmCase(
    @Req() req: { user: AuthUser },
    @Body() dto: Record<string, unknown>,
  ) {
    this.requireAction(req, 'approve_ufm');
    return this.examCell.createUfmCase(this.tenant(req), {
      ...(dto as Parameters<ExamCellService['createUfmCase']>[1]),
      reported_by: req.user.user_id,
    });
  }

  @Get('transcripts')
  listTranscripts(
    @Req() req: { user: AuthUser },
    @Query('semester') semester?: string,
    @Query('status') status?: string,
  ) {
    return this.officialTranscripts.listForTenant(this.tenant(req), {
      semester: semester ? Number(semester) : undefined,
      status,
    });
  }

  @Post('transcripts/generate')
  transcripts(
    @Req()
    req: {
      user: AuthUser;
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    @Body() dto: { semester: number },
  ) {
    this.requireAction(req, 'publish_results');
    const forwarded = req.headers?.['x-forwarded-for'];
    return this.officialTranscripts.requestForSemester(
      this.tenant(req),
      dto.semester,
      {
        userId: req.user.user_id,
        role: examCellRoleFromUser(req.user),
        ip:
          req.ip ??
          (typeof forwarded === 'string'
            ? forwarded.split(',')[0]?.trim()
            : undefined),
        sessionId:
          typeof req.headers?.['x-session-id'] === 'string'
            ? req.headers['x-session-id']
            : undefined,
      },
      true,
    );
  }

  @Post('transcripts/:id/approve')
  approveTranscript(
    @Req()
    req: {
      user: AuthUser;
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    @Param('id') id: string,
  ) {
    this.requireAction(req, 'publish_results');
    const forwarded = req.headers?.['x-forwarded-for'];
    return this.officialTranscripts.approve(this.tenant(req), id, {
      userId: req.user.user_id,
      role: examCellRoleFromUser(req.user),
      ip:
        req.ip ??
        (typeof forwarded === 'string'
          ? forwarded.split(',')[0]?.trim()
          : undefined),
      sessionId:
        typeof req.headers?.['x-session-id'] === 'string'
          ? req.headers['x-session-id']
          : undefined,
    });
  }

  @Get('result-control/sessions')
  listResultSessions(@Req() req: { user: AuthUser }) {
    return this.resultControl.listSessions(this.tenant(req));
  }

  @Post('result-control/sessions')
  createResultSession(
    @Req() req: { user: AuthUser },
    @Body() dto: CreateResultSessionDto,
  ) {
    this.requireAction(req, 'manage_sessions');
    return this.resultControl.createSession(
      this.tenant(req),
      dto,
      req.user.user_id,
    );
  }

  @Get('result-control/sessions/:sessionId')
  getResultSession(
    @Req() req: { user: AuthUser },
    @Param('sessionId') sessionId: string,
  ) {
    return this.resultControl.getSession(this.tenant(req), sessionId);
  }

  @Post('result-control/sessions/:sessionId/open-entry')
  openResultEntry(
    @Req() req: { user: AuthUser },
    @Param('sessionId') sessionId: string,
    @Body() dto: OpenResultEntryDto,
  ) {
    this.requireAction(req, 'manage_sessions');
    return this.resultControl.openEntry(
      this.tenant(req),
      sessionId,
      dto,
      req.user.user_id,
    );
  }

  @Post('result-control/sessions/:sessionId/close-entry')
  closeResultEntry(
    @Req() req: { user: AuthUser },
    @Param('sessionId') sessionId: string,
  ) {
    this.requireAction(req, 'manage_sessions');
    return this.resultControl.closeEntry(
      this.tenant(req),
      sessionId,
      req.user.user_id,
    );
  }

  @Post('result-control/sessions/:sessionId/lock-marks')
  lockResultMarks(
    @Req() req: { user: AuthUser },
    @Param('sessionId') sessionId: string,
  ) {
    this.requireAction(req, 'manage_sessions');
    return this.resultControl.lockMarks(
      this.tenant(req),
      sessionId,
      req.user.user_id,
    );
  }

  @Post('result-control/sessions/:sessionId/prepare-declaration')
  prepareResultDeclaration(
    @Req() req: { user: AuthUser },
    @Param('sessionId') sessionId: string,
  ) {
    this.requireAction(req, 'manage_sessions');
    return this.resultControl.prepareForDeclaration(
      this.tenant(req),
      sessionId,
      req.user.user_id,
    );
  }

  @Post('result-control/sessions/:sessionId/reopen-entry')
  reopenResultEntry(
    @Req() req: { user: AuthUser },
    @Param('sessionId') sessionId: string,
    @Body() dto: ReopenResultEntryDto,
  ) {
    this.requireAction(req, 'manage_sessions');
    return this.resultControl.reopenEntry(
      this.tenant(req),
      sessionId,
      dto,
      req.user.user_id,
    );
  }

  @Post('result-control/sessions/:sessionId/configure-rules')
  configureResultRules(
    @Req() req: { user: AuthUser },
    @Param('sessionId') sessionId: string,
    @Body() dto: ConfigureSessionRulesDto,
  ) {
    this.requireAction(req, 'manage_sessions');
    return this.resultControl.configureRules(
      this.tenant(req),
      sessionId,
      dto,
      req.user.user_id,
    );
  }

  @Get('result-control/courses')
  listResultCourses(@Req() req: { user: AuthUser }) {
    return this.resultControl.listCourses(this.tenant(req));
  }

  @Get('result-control/grading-policies')
  listGradingPolicies() {
    return this.resultControl.listGradingPolicies();
  }

  @Post('result-control/sessions/:sessionId/formula-audit')
  formulaAudit(
    @Req() req: { user: AuthUser },
    @Param('sessionId') sessionId: string,
  ) {
    this.requireAction(req, 'manage_sessions');
    return this.resultControl.runFormulaAudit(
      this.tenant(req),
      sessionId,
      req.user.user_id,
    );
  }

  @Post('result-control/sessions/:sessionId/dean-approval')
  deanApproval(
    @Req() req: { user: AuthUser },
    @Param('sessionId') sessionId: string,
  ) {
    this.requireAction(req, 'manage_sessions');
    return this.resultControl.recordDeanApproval(
      this.tenant(req),
      sessionId,
      req.user.user_id,
    );
  }

  @Post('result-control/sessions/:sessionId/apply-grace')
  applySessionGraceMarks(
    @Req() req: { user: AuthUser },
    @Param('sessionId') sessionId: string,
    @Body() dto: { grace_marks: number },
  ) {
    this.requireAction(req, 'publish_results');
    return this.resultControl.applySessionGraceMarks(
      this.tenant(req),
      sessionId,
      req.user.user_id,
      Number(dto.grace_marks),
    );
  }

  @Post('result-control/sessions/:sessionId/process')
  processResultSession(
    @Req() req: { user: AuthUser },
    @Param('sessionId') sessionId: string,
  ) {
    this.requireAction(req, 'manage_sessions');
    return this.resultControl.processSession(
      this.tenant(req),
      sessionId,
      req.user.user_id,
    );
  }

  @Post('result-control/sessions/:sessionId/declare')
  declareResultSession(
    @Req() req: { user: AuthUser },
    @Param('sessionId') sessionId: string,
    @Body() dto: DeclareResultSessionDto,
  ) {
    this.requireAction(req, 'publish_results');
    return this.resultControl.declareSession(
      this.tenant(req),
      sessionId,
      req.user.user_id,
      dto,
    );
  }

  @Get('result-control/sessions/:sessionId/reports')
  listSessionReports(
    @Req() req: { user: AuthUser },
    @Param('sessionId') sessionId: string,
  ) {
    return this.resultControl.listSessionReports(this.tenant(req), sessionId);
  }

  @Get('sessions')
  listExamSessions(@Req() req: { user: AuthUser }) {
    return this.sessions.listSessions(this.tenant(req));
  }

  @Post('sessions')
  createExamSession(
    @Req() req: { user: AuthUser },
    @Body() dto: CreateExamSessionDto,
  ) {
    this.requireAction(req, 'manage_sessions');
    return this.sessions.createSession(this.tenant(req), req.user.user_id, dto);
  }

  @Post('sessions/:sessionId/status')
  updateExamSessionStatus(
    @Req() req: { user: AuthUser },
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: UpdateExamSessionStatusDto,
  ) {
    this.requireAction(req, 'manage_sessions');
    return this.sessions.updateSessionStatus(
      this.tenant(req),
      sessionId,
      req.user.user_id,
      dto.status,
    );
  }

  @Get('search')
  globalSearch(@Req() req: { user: AuthUser }, @Query('q') q: string) {
    return this.enterprise.advancedSearch(this.tenant(req), q ?? '');
  }

  @Get('calendar/events')
  calendarEvents(
    @Req() req: { user: AuthUser },
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('event_type') eventType?: string,
    @Query('semester') semester?: string,
  ) {
    return this.enterprise.listCalendarEvents(this.tenant(req), {
      from,
      to,
      event_type: eventType,
      semester: semester ? Number(semester) : undefined,
    });
  }

  @Post('calendar/events')
  createCalendarEvent(
    @Req() req: { user: AuthUser },
    @Body() dto: Record<string, unknown>,
  ) {
    this.requireAction(req, 'manage_schedules');
    return this.enterprise.createCalendarEvent(
      this.tenant(req),
      req.user.user_id,
      dto,
    );
  }

  @Post('calendar/events/:eventId/reschedule')
  rescheduleCalendarEvent(
    @Req() req: { user: AuthUser },
    @Param('eventId') eventId: string,
    @Body() dto: { event_date: string },
  ) {
    this.requireAction(req, 'manage_schedules');
    return this.enterprise.updateCalendarEventDate(
      this.tenant(req),
      eventId,
      req.user.user_id,
      dto.event_date,
    );
  }

  @Get('eligibility/dashboard')
  eligibilityDashboard(
    @Req() req: { user: AuthUser },
    @Query('semester') semester?: string,
  ) {
    return this.enterprise.eligibilityDashboard(
      this.tenant(req),
      semester ? Number(semester) : 4,
    );
  }

  @Post('hall-ticket-approvals/sync')
  syncHallTicketApprovals(
    @Req() req: { user: AuthUser },
    @Body() dto: { semester: number; batch_label: string; session_id?: string },
  ) {
    if (dto.session_id !== undefined) {
      this.requireAction(req, 'manage_sessions');
      return this.enterprise.prepareHallTicketApprovals(
        this.tenant(req),
        dto.session_id,
        req.user.user_id,
        examCellRoleFromUser(req.user),
      );
    }
    this.requireAction(req, 'generate_admit_cards');
    return this.enterprise.syncHallTicketApprovals(
      this.tenant(req),
      dto.semester,
      dto.batch_label,
      examCellRoleFromUser(req.user),
    );
  }

  @Get('hall-ticket-approvals')
  listHallTicketApprovals(
    @Req() req: { user: AuthUser },
    @Query('semester') semester?: string,
    @Query('batch_label') batchLabel?: string,
    @Query('stage') stage?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('session_id') sessionId?: string,
  ) {
    return this.enterprise.listHallTicketApprovals(
      this.tenant(req),
      {
        semester: semester ? Number(semester) : undefined,
        batch_label: batchLabel,
        stage,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        search,
        session_id: sessionId,
      },
      examCellRoleFromUser(req.user),
    );
  }

  @Post('hall-ticket-approvals/:approvalId/advance')
  @Roles(...EXAM_CELL_ACCESS_ROLES, 'Accountant')
  advanceHallTicketApproval(
    @Req() req: { user: AuthUser },
    @Param('approvalId', ParseUUIDPipe) approvalId: string,
    @Body() dto: AdvanceHallTicketApprovalDto,
  ) {
    return this.enterprise.advanceHallTicketApproval(
      this.tenant(req),
      approvalId,
      req.user.user_id,
      dto,
      examCellRoleFromUser(req.user),
    );
  }

  @Post('hall-ticket-approvals/bulk-approve')
  @Roles(...EXAM_CELL_ACCESS_ROLES, 'Accountant')
  bulkApproveHallTickets(
    @Req() req: { user: AuthUser },
    @Body() dto: BulkApproveHallTicketsDto,
  ) {
    return this.enterprise.bulkApproveHallTickets(
      this.tenant(req),
      req.user.user_id,
      dto,
      examCellRoleFromUser(req.user),
    );
  }

  @Post('invigilation/auto-assign')
  autoAssignInvigilators(
    @Req() req: { user: AuthUser },
    @Body() dto: { exam_schedule_id: string },
  ) {
    this.requireAction(req, 'manage_sessions');
    return this.enterprise.autoAssignInvigilators(
      this.tenant(req),
      dto.exam_schedule_id,
      req.user.user_id,
    );
  }

  @Get('answer-sheets')
  listAnswerSheets(
    @Req() req: { user: AuthUser },
    @Query('status') status?: string,
    @Query('exam_schedule_id', new ParseUUIDPipe({ optional: true }))
    scheduleId?: string,
  ) {
    return this.enterprise.listAnswerSheets(
      this.tenant(req),
      status,
      scheduleId,
      examCellRoleFromUser(req.user),
    );
  }

  @Post('answer-sheets')
  createAnswerSheet(
    @Req() req: { user: AuthUser },
    @Body() dto: CreateAnswerSheetDto,
  ) {
    this.requireAction(req, 'manage_sessions');
    return this.enterprise.createAnswerSheet(
      this.tenant(req),
      req.user.user_id,
      dto,
      examCellRoleFromUser(req.user),
    );
  }

  @Post('answer-sheets/:sheetId/status')
  updateAnswerSheetStatus(
    @Req() req: { user: AuthUser },
    @Param('sheetId', ParseUUIDPipe) sheetId: string,
    @Body() dto: UpdateAnswerSheetStatusDto,
  ) {
    this.requireAction(req, 'manage_sessions');
    return this.enterprise.updateAnswerSheetStatus(
      this.tenant(req),
      sheetId,
      req.user.user_id,
      dto,
      examCellRoleFromUser(req.user),
    );
  }

  @Post('identity/verify')
  verifyStudentIdentity(
    @Req() req: { user: AuthUser },
    @Body() dto: { qr_payload?: string },
  ) {
    this.requireAction(req, 'manage_seating');
    return this.enterprise.verifyStudentByQr(
      this.tenant(req),
      req.user.user_id,
      dto?.qr_payload ?? '',
    );
  }

  @Get('live-dashboard')
  liveDashboard(@Req() req: { user: AuthUser }) {
    return this.enterprise.liveDashboard(this.tenant(req));
  }

  @Get('grace-marks/policies')
  graceMarksPolicies(@Req() req: { user: AuthUser }) {
    return this.enterprise.listGraceMarksPolicies(this.tenant(req));
  }

  @Post('grace-marks/apply')
  applyGraceMarks(
    @Req() req: { user: AuthUser },
    @Body() dto: Record<string, unknown>,
  ) {
    this.requireAction(req, 'publish_results');
    return this.enterprise.applyGraceMarks(this.tenant(req), dto as never);
  }

  @Post('degree-audit/:studentUserId')
  degreeEligibilityAudit(
    @Req() req: { user: AuthUser },
    @Param('studentUserId') studentUserId: string,
  ) {
    this.requireAction(req, 'manage_sessions');
    return this.enterprise.runDegreeEligibilityAudit(
      this.tenant(req),
      studentUserId,
      req.user.user_id,
    );
  }

  @Get('students/:studentUserId/timeline')
  studentTimeline(
    @Req() req: { user: AuthUser },
    @Param('studentUserId') studentUserId: string,
  ) {
    return this.enterprise.studentExamTimeline(this.tenant(req), studentUserId);
  }

  @Get('student-documents')
  listStudentDocuments(
    @Req() req: { user: AuthUser },
    @Query('status') status?: string,
    @Query('student_user_id') studentUserId?: string,
  ) {
    return this.enterprise.listStudentExamDocuments(this.tenant(req), {
      status,
      student_user_id: studentUserId,
    });
  }

  @Post('student-documents/:docId/verify')
  verifyStudentDocument(
    @Req() req: { user: AuthUser },
    @Param('docId') docId: string,
    @Body() dto: { status: 'VERIFIED' | 'REJECTED' },
  ) {
    this.requireAction(req, 'manage_sessions');
    return this.enterprise.verifyStudentDocument(
      this.tenant(req),
      docId,
      req.user.user_id,
      dto.status,
    );
  }

  @Get('workflows')
  listWorkflows(@Req() req: { user: AuthUser }) {
    return this.enterprise.listWorkflows(this.tenant(req));
  }

  @Get('deadlines')
  listDeadlines(@Req() req: { user: AuthUser }) {
    return this.enterprise.listDeadlines(this.tenant(req));
  }

  @Post('deadlines')
  createDeadline(
    @Req() req: { user: AuthUser },
    @Body() dto: Record<string, unknown>,
  ) {
    this.requireAction(req, 'manage_schedules');
    return this.enterprise.createDeadline(
      this.tenant(req),
      req.user.user_id,
      dto,
    );
  }

  @Get('document-repository')
  documentRepository(
    @Req() req: { user: AuthUser },
    @Query('category') category?: string,
  ) {
    return this.enterprise.listDocumentRepository(this.tenant(req), category);
  }

  @Post('document-repository')
  uploadRepositoryDocument(
    @Req() req: { user: AuthUser },
    @Body() dto: { title: string; category: string; file_url?: string },
  ) {
    this.requireAction(req, 'manage_sessions');
    return this.enterprise.uploadRepositoryDocument(
      this.tenant(req),
      req.user.user_id,
      dto,
    );
  }

  @Get('analytics/advanced')
  advancedAnalytics(
    @Req() req: { user: AuthUser },
    @Query('semester') semester?: string,
  ) {
    return this.enterprise.advancedAnalytics(
      this.tenant(req),
      semester ? Number(semester) : 4,
    );
  }

  @Get('ai/context')
  aiAssistantContext(
    @Req() req: { user: AuthUser },
    @Query('student_user_id') studentUserId?: string,
  ) {
    return this.enterprise.aiAssistantContext(this.tenant(req), studentUserId);
  }

  @Get('audit-log')
  auditLog(
    @Req() req: { user: AuthUser },
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('action') action?: string,
    @Query('resource_type') resourceType?: string,
    @Query('search') search?: string,
  ) {
    return this.audit.list(this.tenant(req), {
      limit: limit ? Number(limit) : 50,
      page: page ? Number(page) : 1,
      action,
      resource_type: resourceType,
      search,
    });
  }

  @Get('form-windows')
  listFormWindows(@Req() req: { user: AuthUser }) {
    return this.operations.listFormWindows(this.tenant(req));
  }

  @Post('form-windows')
  createFormWindow(
    @Req() req: { user: AuthUser },
    @Body() dto: CreateExamFormWindowDto,
  ) {
    this.requireAction(req, 'manage_sessions');
    return this.operations.createFormWindow(
      this.tenant(req),
      req.user.user_id,
      dto,
    );
  }

  @Post('form-windows/:windowId/status')
  updateFormWindowStatus(
    @Req() req: { user: AuthUser },
    @Param('windowId', ParseUUIDPipe) windowId: string,
    @Body() dto: UpdateExamFormWindowStatusDto,
  ) {
    this.requireAction(req, 'manage_sessions');
    return this.operations.updateFormWindowStatus(
      this.tenant(req),
      windowId,
      req.user.user_id,
      dto.status,
    );
  }

  @Post('form-windows/:windowId/sync-registrations')
  syncRegistrations(
    @Req() req: { user: AuthUser },
    @Param('windowId', ParseUUIDPipe) windowId: string,
    @Body() dto: SyncExamRegistrationsDto,
  ) {
    this.requireAction(req, 'manage_sessions');
    return this.operations.seedRegistrationsFromSemester(
      this.tenant(req),
      windowId,
      dto.semester,
      req.user.user_id,
    );
  }

  @Get('registrations')
  listRegistrations(
    @Req() req: { user: AuthUser },
    @Query('window_id') windowId?: string,
    @Query('status') status?: string,
    @Query('semester') semester?: string,
  ) {
    return this.operations.listRegistrations(this.tenant(req), {
      window_id: windowId,
      status,
      semester: semester ? Number(semester) : undefined,
    });
  }

  @Post('registrations/:registrationId/review')
  reviewRegistration(
    @Req() req: { user: AuthUser },
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Body() dto: ReviewExamRegistrationDto,
  ) {
    this.requireAction(req, 'manage_sessions');
    return this.operations.reviewRegistration(
      this.tenant(req),
      registrationId,
      req.user.user_id,
      dto.status,
    );
  }

  @Get('backlog-applications')
  backlogApplications(
    @Req() req: { user: AuthUser },
    @Query('status') status?: string,
  ) {
    return this.operations.listBacklogApplications(this.tenant(req), status);
  }

  @Get('question-papers')
  listQuestionPapers(
    @Req() req: { user: AuthUser },
    @Query('status') status?: string,
  ) {
    return this.operations.listQuestionPapers(this.tenant(req), status);
  }

  @Post('question-papers')
  createQuestionPaper(
    @Req() req: { user: AuthUser },
    @Body() dto: CreateQuestionPaperDto,
  ) {
    this.requireAction(req, 'manage_qp');
    return this.operations.createQuestionPaperRecord(
      this.tenant(req),
      req.user.user_id,
      dto,
      examCellRoleFromUser(req.user),
    );
  }

  @Post('question-papers/:qpId/status')
  updateQuestionPaperStatus(
    @Req() req: { user: AuthUser },
    @Param('qpId', new ParseUUIDPipe()) qpId: string,
    @Body() dto: UpdateQuestionPaperStatusDto,
  ) {
    this.requireAction(req, 'manage_qp');
    return this.operations.updateQuestionPaperStatus(
      this.tenant(req),
      qpId,
      req.user.user_id,
      dto.status,
      examCellRoleFromUser(req.user),
      dto.reason,
    );
  }

  @Post('question-papers/:qpId/file')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024, files: 1 },
    }),
  )
  uploadQuestionPaper(
    @Req() req: { user: AuthUser },
    @Param('qpId', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadQuestionPaperDto,
  ) {
    this.requireAction(req, 'manage_qp');
    return this.paperFiles().upload(
      this.tenant(req),
      id,
      req.user.user_id,
      examCellRoleFromUser(req.user),
      file,
      dto,
    );
  }

  @Get('question-papers/:qpId/versions')
  questionPaperVersions(
    @Req() req: { user: AuthUser },
    @Param('qpId', new ParseUUIDPipe()) id: string,
  ) {
    this.requireAction(req, 'manage_qp');
    return this.paperFiles().versions(
      this.tenant(req),
      id,
      req.user.user_id,
      examCellRoleFromUser(req.user),
    );
  }

  @Get('question-papers/:qpId/versions/:versionId/review-file')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async reviewQuestionPaper(
    @Req() req: { user: AuthUser },
    @Param('qpId', new ParseUUIDPipe()) id: string,
    @Param('versionId', new ParseUUIDPipe()) version: string,
  ) {
    this.requireAction(req, 'manage_qp');
    const file = await this.paperFiles().download(
      this.tenant(req),
      id,
      req.user.user_id,
      examCellRoleFromUser(req.user),
      version,
    );
    return this.paperFile(file);
  }

  @Get('question-papers/:qpId/file')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async releasedQuestionPaper(
    @Req() req: { user: AuthUser },
    @Param('qpId', new ParseUUIDPipe()) id: string,
  ) {
    this.requireAction(req, 'manage_qp');
    const file = await this.paperFiles().download(
      this.tenant(req),
      id,
      req.user.user_id,
      examCellRoleFromUser(req.user),
    );
    return this.paperFile(file);
  }

  private paperFiles(): QuestionPaperWorkflowService {
    if (!this.questionPapers)
      throw new ServiceUnavailableException(
        'Question-paper file workflow unavailable',
      );
    return this.questionPapers;
  }

  private paperFile(file: { buffer: Buffer; filename: string }) {
    return new StreamableFile(file.buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${file.filename}"`,
    });
  }

  @Get('exam-day/today')
  todayExams(
    @Req() req: { user: AuthUser },
    @Query() query: ExamDayDateQueryDto,
  ) {
    return this.operations.listTodayExams(this.tenant(req), query.date);
  }

  @Get('exam-day/scripts')
  reconcileScripts(
    @Req() req: { user: AuthUser },
    @Query('exam_schedule_id', ParseUUIDPipe) scheduleId: string,
  ) {
    return this.scriptService().reconciliation(
      this.tenant(req),
      scheduleId,
      examCellRoleFromUser(req.user),
    );
  }

  @Post('answer-sheets/:sheetId/correct-receipt')
  correctScriptReceipt(
    @Req() req: { user: AuthUser },
    @Param('sheetId', ParseUUIDPipe) sheetId: string,
    @Body() dto: CorrectScriptReceiptDto,
  ) {
    this.requireAction(req, 'manage_sessions');
    return this.scriptService().correctReceipt(
      this.tenant(req),
      sheetId,
      req.user.user_id,
      dto,
      examCellRoleFromUser(req.user),
    );
  }

  @Post('exam-day/scripts/missing')
  reportMissingScript(
    @Req() req: { user: AuthUser },
    @Body() dto: ReportMissingScriptDto,
  ) {
    this.requireAction(req, 'manage_sessions');
    return this.scriptService().reportMissing(
      this.tenant(req),
      req.user.user_id,
      dto,
      examCellRoleFromUser(req.user),
    );
  }

  @Post('exam-day/scripts/:discrepancyId/resolve')
  resolveMissingScript(
    @Req() req: { user: AuthUser },
    @Param('discrepancyId', ParseUUIDPipe) discrepancyId: string,
    @Body() dto: ResolveMissingScriptDto,
  ) {
    this.requireAction(req, 'manage_sessions');
    return this.scriptService().resolveMissing(
      this.tenant(req),
      discrepancyId,
      req.user.user_id,
      dto,
      examCellRoleFromUser(req.user),
    );
  }

  @Get('exam-day/ufm')
  examDayIncidents(
    @Req() req: { user: AuthUser },
    @Query('exam_schedule_id', ParseUUIDPipe) scheduleId: string,
  ) {
    return this.scriptService().listIncidents(
      this.tenant(req),
      scheduleId,
      examCellRoleFromUser(req.user),
    );
  }

  @Post('exam-day/ufm')
  reportExamDayIncident(
    @Req() req: { user: AuthUser },
    @Body() dto: ReportExamDayUfmDto,
  ) {
    this.requireAction(req, 'approve_ufm');
    return this.scriptService().reportIncident(
      this.tenant(req),
      req.user.user_id,
      dto,
      examCellRoleFromUser(req.user),
    );
  }

  @Post('exam-day/ufm/:caseId/status')
  reviewExamDayIncident(
    @Req() req: { user: AuthUser },
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: ReviewExamDayUfmDto,
  ) {
    this.requireAction(req, 'approve_ufm');
    return this.scriptService().reviewIncident(
      this.tenant(req),
      caseId,
      req.user.user_id,
      dto,
      examCellRoleFromUser(req.user),
    );
  }

  @Get('exam-day/roster')
  examDayRoster(
    @Req() req: { user: AuthUser },
    @Query('exam_schedule_id', ParseUUIDPipe) examScheduleId: string,
  ) {
    return this.operations.listExamDayRoster(this.tenant(req), examScheduleId);
  }

  @Get('exam-day/attendance')
  examDayAttendance(
    @Req() req: { user: AuthUser },
    @Query('exam_schedule_id', ParseUUIDPipe) examScheduleId: string,
  ) {
    return this.operations.listExamDayAttendance(
      this.tenant(req),
      examScheduleId,
    );
  }

  @Post('exam-day/attendance')
  markExamDayAttendance(
    @Req() req: { user: AuthUser },
    @Body()
    dto: MarkExamDayAttendanceDto,
  ) {
    this.requireAction(req, 'manage_sessions');
    return this.operations.markExamDayAttendance(
      this.tenant(req),
      req.user.user_id,
      dto,
    );
  }

  @Get('exam-centres')
  examCentres(@Req() req: { user: AuthUser }) {
    return this.operations.listExamCentres(this.tenant(req));
  }

  @Get('reports/summary')
  reportsSummary(
    @Req() req: { user: AuthUser },
    @Query('semester') semester?: string,
  ) {
    return this.operations.getReportsSummary(
      this.tenant(req),
      semester ? Number(semester) : undefined,
    );
  }

  @Get('notifications/campaigns')
  notificationCampaigns(@Req() req: { user: AuthUser }) {
    return this.operations.listNotificationCampaigns(this.tenant(req));
  }

  @Post('notifications/send')
  sendNotification(
    @Req() req: { user: AuthUser },
    @Body()
    dto: { channel: string; subject: string; body: string; audience?: string },
  ) {
    this.requireAction(req, 'manage_sessions');
    return this.operations.sendNotificationCampaign(
      this.tenant(req),
      req.user.user_id,
      {
        channel: dto.channel,
        subject: dto.subject,
        body: dto.body,
        audience: dto.audience ?? 'ALL_STUDENTS',
      },
    );
  }

  @Get('my-tasks')
  myTasks(@Req() req: { user: AuthUser }) {
    return this.operations.listMyTasks(this.tenant(req));
  }

  @Get('dev/status')
  devStatus(@Req() req: { user: AuthUser }) {
    if (process.env.NODE_ENV === 'production') {
      throw new BadRequestException('Dev endpoints are disabled in production');
    }
    return this.dev.status(this.tenant(req));
  }

  @Post('dev/bootstrap')
  devBootstrap(@Req() req: { user: AuthUser }) {
    if (process.env.NODE_ENV === 'production') {
      throw new BadRequestException('Dev endpoints are disabled in production');
    }
    return this.dev.bootstrap(this.tenant(req), req.user.user_id);
  }

  private tenant(req: { user: AuthUser }) {
    return requireTenantId(req.user.tenant_id);
  }

  private scriptService() {
    if (!this.scripts)
      throw new ServiceUnavailableException(
        'Exam-day script tracking is unavailable',
      );
    return this.scripts;
  }

  private requireAction(req: { user: AuthUser }, action: ExamCellAction) {
    assertExamCellAction(examCellRoleFromUser(req.user), action);
  }
}
