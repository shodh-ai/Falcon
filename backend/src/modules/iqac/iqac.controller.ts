import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { IqacService } from './iqac.service';
import { IqacAnalyticsService } from './iqac-analytics.service';
import { AlumniAdminService } from '../alumni/alumni-admin.service';
import { CreateJobPostingDto } from './dto/create-job-posting.dto';
import { ApplyToJobDto } from './dto/apply-to-job.dto';
import { CreateAlumniRequestDto } from './dto/create-alumni-request.dto';

type AuthUser = { user_id: string; tenant_id?: string };

@Controller('iqac')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IqacController {
  constructor(
    private readonly iqac: IqacService,
    private readonly analytics: IqacAnalyticsService,
    private readonly alumniAdmin: AlumniAdminService,
  ) {}

  @Get('dashboard')
  @Roles('SuperAdmin', 'IQAC', 'President')
  dashboard(@Req() req: { user: AuthUser }) {
    return this.analytics.getKpiDashboard(this.tenant(req));
  }

  @Get('ranking-analytics')
  @Roles('SuperAdmin', 'IQAC', 'President')
  ranking(@Req() req: { user: AuthUser }) {
    return this.analytics.getRankingAnalytics(this.tenant(req));
  }

  @Get('faculty-data')
  @Roles('SuperAdmin', 'IQAC', 'President')
  facultyData(
    @Req() req: { user: AuthUser },
    @Query('tab') tab = 'publications',
    @Query('academic_year') academicYear?: string,
  ) {
    return this.analytics.getFacultyData(this.tenant(req), tab, academicYear);
  }

  @Get('faculty-data/export')
  @Roles('SuperAdmin', 'IQAC')
  @Header('Content-Type', 'text/csv')
  async facultyExport(
    @Req() req: { user: AuthUser },
    @Query('tab') tab = 'publications',
    @Res() res: Response,
  ) {
    const data = await this.analytics.getFacultyData(this.tenant(req), tab);
    const csv = this.analytics.exportFacultyCsv(data.rows);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="iqac-faculty-${tab}.csv"`,
    );
    res.send(csv);
  }

  @Get('student-outcomes')
  @Roles('SuperAdmin', 'IQAC', 'President')
  studentOutcomes(@Req() req: { user: AuthUser }) {
    return this.analytics.getStudentOutcomes(this.tenant(req));
  }

  @Get('repository')
  @Roles('SuperAdmin', 'IQAC', 'President', 'Registrar')
  repository(
    @Req() req: { user: AuthUser },
    @Query('criterion') criterion?: string,
    @Query('academic_year') academicYear?: string,
  ) {
    return this.analytics.getRepository(
      this.tenant(req),
      criterion ? Number(criterion) : undefined,
      academicYear,
    );
  }

  @Post('repository/documents')
  @Roles('SuperAdmin', 'IQAC', 'Registrar')
  addRepositoryDocument(
    @Req() req: { user: AuthUser },
    @Body()
    dto: {
      naac_criterion: number;
      metric_number?: string;
      title: string;
      file_path: string;
      academic_year?: string;
    },
  ) {
    return this.analytics.addRepositoryDocument(
      this.tenant(req),
      req.user.user_id,
      dto,
    );
  }

  @Delete('repository/documents/:id')
  @Roles('SuperAdmin', 'IQAC', 'Registrar')
  deleteRepositoryDocument(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
  ) {
    return this.analytics.deleteRepositoryDocument(this.tenant(req), id);
  }

  @Get('repository/export')
  @Roles('SuperAdmin', 'IQAC', 'President', 'Registrar')
  @Header('Content-Type', 'text/csv')
  async repositoryExport(
    @Req() req: { user: AuthUser },
    @Res() res: Response,
    @Query('criterion') criterion?: string,
    @Query('academic_year') academicYear = '2025-2026',
  ) {
    const csv = await this.analytics.exportRepositoryCsv(
      this.tenant(req),
      criterion ? Number(criterion) : undefined,
      academicYear,
    );
    const suffix = criterion ? `-c${criterion}` : '';
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="naac-repository${suffix}.csv"`,
    );
    res.send(csv);
  }

  @Get('audits')
  @Roles('SuperAdmin', 'IQAC', 'President')
  audits(
    @Req() req: { user: AuthUser },
    @Query('academic_year') academicYear?: string,
  ) {
    return this.analytics.getAudits(this.tenant(req), academicYear);
  }

  @Get('reports')
  @Roles('SuperAdmin', 'IQAC')
  reports(@Req() req: { user: AuthUser }) {
    return this.analytics.listReports(this.tenant(req));
  }

  @Post('reports/generate')
  @Roles('SuperAdmin', 'IQAC')
  generateReport(
    @Req() req: { user: AuthUser },
    @Body() dto: { report_type: 'AQAR' | 'SSR'; academic_year: string },
  ) {
    return this.analytics.generateReport(
      this.tenant(req),
      req.user.user_id,
      dto,
    );
  }

  @Post('analytics/refresh')
  @Roles('SuperAdmin', 'IQAC')
  refreshViews() {
    return this.analytics.refreshMaterializedViews();
  }

  @Get('task-master')
  @Roles('SuperAdmin', 'IQAC')
  listTaskMaster() {
    return this.iqac.listTaskMaster();
  }

  @Post('task-master')
  @Roles('SuperAdmin', 'IQAC')
  createTaskMaster(
    @Body()
    dto: {
      task_name?: string;
      task_description?: string;
      role_id?: number;
      month?: string;
      is_recurring?: boolean;
    },
  ) {
    return this.iqac.createTaskMaster(dto);
  }

  @Get('document-vault')
  @Roles('SuperAdmin', 'IQAC')
  documentVault() {
    return this.iqac.listDocumentVault();
  }

  @Get('student-achievements')
  @Roles('SuperAdmin', 'IQAC', 'President')
  studentAchievements() {
    return this.iqac.listStudentAchievements();
  }

  @Get('export-center')
  @Roles('SuperAdmin', 'IQAC')
  exportCenter() {
    return this.iqac.getExportCenter();
  }

  @Get('placements/jobs')
  listJobs() {
    return this.iqac.listJobs();
  }

  @Post('placements/jobs')
  @Roles('SuperAdmin', 'PlacementCell')
  createJob(@Req() req: { user: AuthUser }, @Body() dto: CreateJobPostingDto) {
    return this.iqac.createJob(
      dto,
      req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001',
    );
  }

  @Post('placements/jobs/:id/apply')
  apply(@Param('id') id: string, @Body() dto: ApplyToJobDto) {
    return this.iqac.applyToJob(id, dto);
  }

  @Get('alumni/requests')
  listAlumniRequests(@Query('alumniUserId') alumniUserId?: string) {
    return this.iqac.listAlumniRequests(alumniUserId);
  }

  @Post('alumni/requests')
  createAlumniRequest(@Body() dto: CreateAlumniRequestDto) {
    return this.iqac.createAlumniRequest(dto);
  }

  @Get('alumni/verification-queue')
  @Roles('SuperAdmin', 'IQAC', 'Registrar', 'President')
  alumniVerificationQueue(@Req() req: { user: AuthUser }) {
    return this.alumniAdmin.verificationQueue(this.tenant(req));
  }

  @Patch('alumni/profiles/:alumniId/verify')
  @Roles('SuperAdmin', 'IQAC', 'Registrar')
  alumniVerify(
    @Req() req: { user: AuthUser },
    @Param('alumniId') alumniId: string,
    @Body() dto: { action: 'approve' | 'reject' },
  ) {
    return this.alumniAdmin.verifyProfile(
      this.tenant(req),
      alumniId,
      req.user.user_id,
      dto,
    );
  }

  @Get('alumni/donations')
  @Roles('SuperAdmin', 'IQAC', 'Registrar')
  alumniDonations(@Req() req: { user: AuthUser }) {
    return this.alumniAdmin.donationLedger(this.tenant(req));
  }

  @Get('alumni/donations/summary')
  @Roles('SuperAdmin', 'IQAC', 'Registrar')
  alumniDonationSummary(@Req() req: { user: AuthUser }) {
    return this.alumniAdmin.donationSummary(this.tenant(req));
  }

  @Get('alumni/engagement')
  @Roles('SuperAdmin', 'IQAC', 'President')
  alumniEngagement(@Req() req: { user: AuthUser }) {
    return this.alumniAdmin.engagementAnalytics(this.tenant(req));
  }

  @Get('alumni/events')
  @Roles('SuperAdmin', 'IQAC', 'Registrar')
  alumniEvents(@Req() req: { user: AuthUser }) {
    return this.alumniAdmin.listEventsAdmin(this.tenant(req));
  }

  @Post('alumni/events')
  @Roles('SuperAdmin', 'IQAC', 'Registrar')
  alumniCreateEvent(
    @Req() req: { user: AuthUser },
    @Body()
    dto: {
      title: string;
      event_date: string;
      venue?: string;
      description?: string;
    },
  ) {
    return this.alumniAdmin.createEvent(this.tenant(req), dto);
  }

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }
}
