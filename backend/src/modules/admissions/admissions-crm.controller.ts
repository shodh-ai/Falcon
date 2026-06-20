import { Body, Controller, Get, Param, Patch, Post, Req, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdmissionsService } from './admissions.service';
import { CounselingService } from './counseling.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadStageDto } from './dto/update-lead-stage.dto';
import { HrWorkforceService } from '../hr/hr-workforce.service';
import type { StaffRequestType } from '../../entities/staff-leave-request.entity';

type AuthUser = { user_id: string; tenant_id?: string; role?: string; roles?: string[] };

@Controller('api/admissions-crm')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SuperAdmin', 'AdmissionsOfficer', 'Registrar')
export class AdmissionsCrmController {
  constructor(
    private readonly admissions: AdmissionsService,
    private readonly counseling: CounselingService,
    private readonly workforce: HrWorkforceService,
  ) {}

  @Get('kanban')
  kanban(@Req() req: { user: AuthUser }) {
    return this.admissions.kanbanBoard(this.tenant(req));
  }

  @Get('enrolled-students')
  @Roles('SuperAdmin', 'AdmissionsOfficer', 'Registrar', 'Accountant', 'FinanceManager')
  getEnrolledStudents(
    @Req() req: { user: AuthUser },
    @Query('q') q?: string,
    @Query('year') year?: string,
    @Query('branch') branch?: string,
  ) {
    return this.admissions.getEnrolledStudents(this.tenant(req), q, year, branch);
  }

  @Patch('transactions/:id/receipt')
  @Roles('SuperAdmin', 'AdmissionsOfficer', 'Registrar', 'Accountant', 'FinanceManager')
  uploadReceipt(@Param('id') id: string, @Body() dto: { receipt_url: string }) {
    return this.admissions.uploadTransactionReceipt(id, dto.receipt_url);
  }

  @Post('enrolled-students/:id/documents')
  uploadEnrolledStudentDocument(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: { title: string; file_path: string },
  ) {
    return this.admissions.uploadEnrolledStudentDocument(this.tenant(req), id, dto);
  }

  @Get('leads/:id/timeline')
  timeline(@Param('id') id: string) {
    return this.admissions.getLeadTimeline(id);
  }

  @Post('leads')
  createLead(@Req() req: { user: AuthUser }, @Body() dto: CreateLeadDto) {
    return this.admissions.createLead(dto, this.tenant(req));
  }

  @Patch('leads/:id/stage')
  updateStage(@Param('id') id: string, @Body() dto: UpdateLeadStageDto) {
    return this.admissions.updateLeadStage(id, dto);
  }

  @Post('leads/:id/activities')
  logActivity(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: { channel: string; direction?: string; subject?: string; body?: string; metadata?: Record<string, unknown> },
  ) {
    return this.admissions.logLeadActivity(this.tenant(req), id, dto);
  }

  @Post('leads/:id/documents')
  uploadDocument(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: { title: string; file_path: string },
  ) {
    return this.admissions.uploadLeadDocument(this.tenant(req), id, dto);
  }

  @Get('counseling/seats')
  seatMatrix(@Req() req: { user: AuthUser }) {
    return this.counseling.getSeatMatrix(this.tenant(req));
  }

  @Post('counseling/seats/:programCode/allot')
  allotSeat(@Req() req: { user: AuthUser }, @Param('programCode') programCode: string) {
    return this.counseling.allotSeat(this.tenant(req), programCode);
  }

  @Get('counseling/merit-list')
  meritList(@Req() req: { user: AuthUser }) {
    return this.counseling.listMeritRanks(this.tenant(req));
  }

  /** Admissions/registrar self-service leave — avoids HR portal role gates on legacy deploys. */
  @Post('self-service/workforce/requests')
  submitWorkforceRequest(
    @Req() req: { user: AuthUser },
    @Body()
    dto: {
      request_type: StaffRequestType;
      leave_type?: string;
      start_date?: string;
      end_date?: string;
      regularization_date?: string;
      missed_punch_type?: 'IN' | 'OUT' | 'BOTH';
      reason?: string;
    },
  ) {
    return this.workforce.applyRequest(req.user.user_id, this.tenant(req), dto, {
      actorRoles: this.resolveRoles(req.user),
    });
  }

  @Get('self-service/workforce/my-requests')
  myWorkforceRequests(@Req() req: { user: AuthUser }) {
    return this.workforce.listMyRequests(req.user.user_id, this.tenant(req));
  }

  @Post('counseling/generate-merit')
  generateMerit(
    @Req() req: { user: AuthUser },
    @Body() body: { academic_year: string; sc_pct?: number; st_pct?: number; general_pct?: number },
  ) {
    return this.counseling.generateMeritList(this.tenant(req), body.academic_year, body);
  }

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  private resolveRoles(user: AuthUser): string[] {
    return user.roles?.length ? user.roles : user.role ? [user.role] : [];
  }
}
