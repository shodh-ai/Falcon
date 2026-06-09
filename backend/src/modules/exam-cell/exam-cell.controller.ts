import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ExamCellService } from './exam-cell.service';

type AuthUser = { user_id: string; tenant_id?: string };

@Controller('api/exam-cell')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ExamCell', 'SuperAdmin')
export class ExamCellController {
  constructor(private readonly examCell: ExamCellService) {}

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
  autoAllocate(@Req() req: { user: AuthUser }, @Body() dto: { exam_schedule_id: string; semester: number; rooms: string[] }) {
    return this.examCell.autoAllocateSeating(this.tenant(req), dto);
  }

  @Get('seating-allocations')
  seatingAllocations(@Req() req: { user: AuthUser }, @Query('exam_schedule_id') examScheduleId?: string) {
    return this.examCell.listSeatingAllocations(this.tenant(req), examScheduleId);
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

  @Get('faculty-roster')
  facultyRoster(@Req() req: { user: AuthUser }) {
    return this.examCell.listFacultyForInvigilation(this.tenant(req));
  }

  @Get('results/pending')
  pendingResults(@Req() req: { user: AuthUser }) {
    return this.examCell.listPendingCoeMarks(this.tenant(req));
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

  @Get('grade-cards')
  gradeCards() {
    return this.examCell.listGradeCards();
  }

  @Get('ufm-cases')
  ufmCases() {
    return this.examCell.listUfmCases();
  }

  @Post('ufm-cases')
  createUfmCase(@Req() req: { user: AuthUser }, @Body() dto: Record<string, unknown>) {
    return this.examCell.createUfmCase(this.tenant(req), dto as Parameters<ExamCellService['createUfmCase']>[1]);
  }

  @Post('transcripts/generate')
  transcripts(@Req() req: { user: AuthUser }, @Body() dto: { semester: number }) {
    return this.examCell.generateTranscripts(this.tenant(req), dto.semester);
  }

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }
}
