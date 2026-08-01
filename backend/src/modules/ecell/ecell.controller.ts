import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { EcellService } from './ecell.service';
import { EcellFounderService } from './ecell-founder.service';
import { EcellUropService } from './ecell-urop.service';
import { SubmitEcellProjectDto } from './dto/submit-project.dto';
import { UpsertEcellConfigDto } from './dto/upsert-config.dto';
import {
  EcellApprovalActionDto,
  EcellRejectDto,
} from './dto/approval-action.dto';
import {
  BookWorkspaceDto,
  MentorFeedbackDto,
  RequestMentorMeetingDto,
  RespondMentorMeetingDto,
} from './dto/founder.dto';

type AuthUser = {
  user_id: string;
  tenant_id?: string;
  roles?: string[];
};

const INCUBATION_ADMIN = 'Incubation_Admin';
const LEGACY_ECELL_ADMIN = 'ECellAdmin';

@Controller('api/ecell')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EcellController {
  constructor(
    private readonly ecell: EcellService,
    private readonly founder: EcellFounderService,
    private readonly urop: EcellUropService,
  ) {}

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  @Get('config/active')
  @Roles(
    'Student',
    INCUBATION_ADMIN,
    LEGACY_ECELL_ADMIN,
    'SuperAdmin',
    'HOD',
    'Dean',
  )
  activeConfig(@Req() req: { user: AuthUser }) {
    return this.ecell.getActiveConfiguration(this.tenant(req));
  }

  @Get('config')
  @Roles(INCUBATION_ADMIN, LEGACY_ECELL_ADMIN, 'SuperAdmin')
  listConfig(@Req() req: { user: AuthUser }) {
    return this.ecell.listConfigurations(this.tenant(req));
  }

  @Post('config')
  @Roles(INCUBATION_ADMIN, LEGACY_ECELL_ADMIN, 'SuperAdmin')
  upsertConfig(
    @Req() req: { user: AuthUser },
    @Body() dto: UpsertEcellConfigDto,
  ) {
    return this.ecell.upsertConfiguration(this.tenant(req), dto);
  }

  @Post('projects')
  @Roles('Student')
  submitProject(
    @Req() req: { user: AuthUser },
    @Body() dto: SubmitEcellProjectDto,
  ) {
    return this.ecell.submitProject(this.tenant(req), req.user.user_id, dto);
  }

  @Get('projects/mine')
  @Roles('Student')
  myProjects(@Req() req: { user: AuthUser }) {
    return this.ecell.listMyProjects(this.tenant(req), req.user.user_id);
  }

  @Get('admin/triage')
  @Roles(INCUBATION_ADMIN, LEGACY_ECELL_ADMIN, 'SuperAdmin')
  triageQueue(@Req() req: { user: AuthUser }) {
    return this.ecell.listTriageQueue(this.tenant(req));
  }

  @Post('admin/triage/:id/push-l1')
  @Roles(INCUBATION_ADMIN, LEGACY_ECELL_ADMIN, 'SuperAdmin')
  pushToL1(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.ecell.pushToL1(this.tenant(req), id);
  }

  @Post('admin/triage/:id/reject')
  @Roles(INCUBATION_ADMIN, LEGACY_ECELL_ADMIN, 'SuperAdmin')
  triageReject(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: EcellRejectDto,
  ) {
    return this.ecell.rejectProject(
      this.tenant(req),
      req.user.user_id,
      id,
      dto.remarks,
      0,
    );
  }

  @Get('admin/portfolio')
  @Roles(INCUBATION_ADMIN, LEGACY_ECELL_ADMIN, 'SuperAdmin')
  portfolio(@Req() req: { user: AuthUser }) {
    return this.ecell.listPortfolio(this.tenant(req));
  }

  @Get('admin/pipeline/board')
  @Roles(
    INCUBATION_ADMIN,
    LEGACY_ECELL_ADMIN,
    'SuperAdmin',
    'HOD',
    'Dean',
    'President',
  )
  pipelineBoard(@Req() req: { user: AuthUser }) {
    return this.ecell.listPipelineBoard(this.tenant(req));
  }

  @Get('approvals/l1/pending')
  @Roles('HOD', 'Dean', INCUBATION_ADMIN, LEGACY_ECELL_ADMIN, 'SuperAdmin')
  l1Queue(@Req() req: { user: AuthUser }) {
    return this.ecell.listL1Queue(this.tenant(req), req.user.roles);
  }

  @Post('approvals/l1/:id/approve')
  @Roles('HOD', 'Dean', INCUBATION_ADMIN, LEGACY_ECELL_ADMIN, 'SuperAdmin')
  approveL1(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: EcellApprovalActionDto,
  ) {
    return this.ecell.approveL1(
      this.tenant(req),
      req.user.user_id,
      req.user.roles,
      id,
      dto,
    );
  }

  @Post('approvals/l1/:id/reject')
  @Roles('HOD', 'Dean', INCUBATION_ADMIN, LEGACY_ECELL_ADMIN, 'SuperAdmin')
  rejectL1(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: EcellRejectDto,
  ) {
    return this.ecell.rejectProject(
      this.tenant(req),
      req.user.user_id,
      id,
      dto.remarks,
      1,
    );
  }

  @Get('approvals/l2/pending')
  @Roles(
    'Dean',
    'President',
    INCUBATION_ADMIN,
    LEGACY_ECELL_ADMIN,
    'SuperAdmin',
  )
  l2Queue(@Req() req: { user: AuthUser }) {
    return this.ecell.listL2Queue(this.tenant(req), req.user.roles);
  }

  @Post('approvals/l2/:id/approve')
  @Roles(
    'Dean',
    'President',
    INCUBATION_ADMIN,
    LEGACY_ECELL_ADMIN,
    'SuperAdmin',
  )
  approveL2(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: EcellApprovalActionDto,
  ) {
    return this.ecell.approveL2(
      this.tenant(req),
      req.user.user_id,
      req.user.roles,
      id,
      dto,
    );
  }

  @Post('approvals/l2/:id/reject')
  @Roles(
    'Dean',
    'President',
    INCUBATION_ADMIN,
    LEGACY_ECELL_ADMIN,
    'SuperAdmin',
  )
  rejectL2(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: EcellRejectDto,
  ) {
    return this.ecell.rejectProject(
      this.tenant(req),
      req.user.user_id,
      id,
      dto.remarks,
      2,
    );
  }

  @Get('admin/dashboard')
  @Roles(
    INCUBATION_ADMIN,
    LEGACY_ECELL_ADMIN,
    'FellowshipAdmin',
    'Wrangler',
    'SuperAdmin',
    'CampusAdmin',
  )
  dashboard(@Req() req: { user: AuthUser }) {
    return this.ecell.dashboardSummary(this.tenant(req));
  }

  @Get('admin/report/export')
  @Roles(INCUBATION_ADMIN, LEGACY_ECELL_ADMIN, 'SuperAdmin', 'IQAC')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  async exportReport(@Req() req: { user: AuthUser }, @Res() res: Response) {
    const buffer = await this.ecell.exportIncubationReport(this.tenant(req));
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="incubation-naac-nirf-report.xlsx"',
    );
    res.send(buffer);
  }

  @Get('admin/grants')
  @Roles(INCUBATION_ADMIN, LEGACY_ECELL_ADMIN, 'SuperAdmin')
  grants(@Req() req: { user: AuthUser }) {
    return this.ecell.listDisbursementRequests(this.tenant(req));
  }

  @Get('finance/payouts')
  @Roles(
    'Accountant',
    'CFO',
    'APManager',
    'APClerk',
    'FinanceController',
    'SuperAdmin',
    'CampusAdmin',
  )
  financePayouts(@Req() req: { user: AuthUser }) {
    return this.ecell.listFinancePayoutsSanitized(this.tenant(req));
  }

  @Get('founder/status')
  @Roles('Student')
  founderStatus(@Req() req: { user: AuthUser }) {
    return this.founder.founderStatus(this.tenant(req), req.user.user_id);
  }

  @Get('founder/workspaces')
  @Roles('Student')
  workspaces(@Req() req: { user: AuthUser }) {
    return this.founder.listWorkspaces(this.tenant(req));
  }

  @Get('founder/workspaces/:id/calendar')
  @Roles('Student')
  workspaceCalendar(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Query('date') date: string,
  ) {
    return this.founder.workspaceCalendar(
      this.tenant(req),
      id,
      date ?? new Date().toISOString(),
    );
  }

  @Get('founder/bookings')
  @Roles('Student')
  myBookings(@Req() req: { user: AuthUser }) {
    return this.founder.listMyBookings(this.tenant(req), req.user.user_id);
  }

  @Post('founder/workspaces/book')
  @Roles('Student')
  bookWorkspace(@Req() req: { user: AuthUser }, @Body() dto: BookWorkspaceDto) {
    return this.founder.bookWorkspace(this.tenant(req), req.user.user_id, dto);
  }

  @Get('founder/mentors')
  @Roles('Student')
  mentors(@Req() req: { user: AuthUser }) {
    return this.founder.listMentors(this.tenant(req));
  }

  @Get('founder/mentor-meetings')
  @Roles('Student')
  studentMeetings(@Req() req: { user: AuthUser }) {
    return this.founder.listStudentMeetings(this.tenant(req), req.user.user_id);
  }

  @Post('founder/mentor-meetings')
  @Roles('Student')
  requestMeeting(
    @Req() req: { user: AuthUser },
    @Body() dto: RequestMentorMeetingDto,
  ) {
    return this.founder.requestMentorMeeting(
      this.tenant(req),
      req.user.user_id,
      dto,
    );
  }

  @Get('mentor/inbox')
  @Roles(
    'Faculty',
    'HOD',
    'Dean',
    'President',
    'Alumni',
    INCUBATION_ADMIN,
    LEGACY_ECELL_ADMIN,
    'SuperAdmin',
  )
  mentorInbox(@Req() req: { user: AuthUser }) {
    return this.founder.listMentorInbox(req.user.user_id, this.tenant(req));
  }

  @Get('mentor/feedback-pending')
  @Roles(
    'Faculty',
    'HOD',
    'Dean',
    'President',
    'Alumni',
    INCUBATION_ADMIN,
    LEGACY_ECELL_ADMIN,
    'SuperAdmin',
  )
  mentorFeedbackPending(@Req() req: { user: AuthUser }) {
    return this.founder.listMentorFeedbackPending(
      req.user.user_id,
      this.tenant(req),
    );
  }

  @Post('mentor/meetings/:id/accept')
  @Roles(
    'Faculty',
    'HOD',
    'Dean',
    'President',
    'Alumni',
    INCUBATION_ADMIN,
    LEGACY_ECELL_ADMIN,
    'SuperAdmin',
  )
  acceptMeeting(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: RespondMentorMeetingDto,
  ) {
    return this.founder.respondMentorMeeting(
      this.tenant(req),
      req.user.user_id,
      id,
      true,
      dto,
    );
  }

  @Post('mentor/meetings/:id/decline')
  @Roles(
    'Faculty',
    'HOD',
    'Dean',
    'President',
    'Alumni',
    INCUBATION_ADMIN,
    LEGACY_ECELL_ADMIN,
    'SuperAdmin',
  )
  declineMeeting(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: RespondMentorMeetingDto,
  ) {
    return this.founder.respondMentorMeeting(
      this.tenant(req),
      req.user.user_id,
      id,
      false,
      dto,
    );
  }

  @Post('mentor/meetings/:id/feedback')
  @Roles(
    'Faculty',
    'HOD',
    'Dean',
    'President',
    'Alumni',
    INCUBATION_ADMIN,
    LEGACY_ECELL_ADMIN,
    'SuperAdmin',
  )
  mentorFeedback(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: MentorFeedbackDto,
  ) {
    return this.founder.submitMentorFeedback(
      this.tenant(req),
      req.user.user_id,
      id,
      dto,
    );
  }

  @Get('admin/mentor-progress')
  @Roles(INCUBATION_ADMIN, LEGACY_ECELL_ADMIN, 'SuperAdmin')
  mentorProgress(@Req() req: { user: AuthUser }) {
    return this.founder.listAdminMentorProgress(this.tenant(req));
  }

  @Get('ip-agreements')
  @Roles(INCUBATION_ADMIN, LEGACY_ECELL_ADMIN, 'FellowshipAdmin', 'SuperAdmin', 'Student')
  listIp(@Req() req: { user: AuthUser }) {
    return this.urop.listIpAgreements(this.tenant(req));
  }

  @Post('ip-agreements')
  @Roles(INCUBATION_ADMIN, LEGACY_ECELL_ADMIN, 'FellowshipAdmin', 'SuperAdmin', 'Student')
  upsertIp(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      project_id: string;
      lead_inventor_user_id?: string;
      university_equity_pct?: number;
      sgvu_pays_legal_fees?: boolean;
      reversion_years?: number;
      status?: string;
      signed_doc_url?: string;
    },
  ) {
    return this.urop.upsertIpAgreement(this.tenant(req), {
      ...body,
      lead_inventor_user_id: body.lead_inventor_user_id ?? req.user.user_id,
    });
  }

  @Get('fellowships')
  @Roles(INCUBATION_ADMIN, LEGACY_ECELL_ADMIN, 'FellowshipAdmin', 'Wrangler', 'SuperAdmin', 'Student')
  listFellowships(@Req() req: { user: AuthUser }) {
    return this.urop.listFellowships(this.tenant(req));
  }

  @Post('fellowships/apply')
  @Roles('Student')
  applyFellowship(
    @Req() req: { user: AuthUser },
    @Body() body: { linked_project_id?: string; paid_stipend_inr?: number },
  ) {
    return this.urop.applyFellowship(this.tenant(req), req.user.user_id, body);
  }

  @Post('fellowships/:id/decide')
  @Roles(INCUBATION_ADMIN, LEGACY_ECELL_ADMIN, 'FellowshipAdmin', 'Wrangler', 'SuperAdmin')
  decideFellowship(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: { decision: 'PASSED' | 'FAILED' | 'CONVERTED'; notes?: string },
  ) {
    return this.urop.decideFellowship(
      this.tenant(req),
      req.user.user_id,
      id,
      body.decision,
      body.notes,
    );
  }

  @Get('product-viva/panelists')
  @Roles(
    'Faculty',
    'ExamCell',
    'Dean',
    'President',
    INCUBATION_ADMIN,
    'SuperAdmin',
    'CampusAdmin',
  )
  listPanelists(
    @Req() req: { user: AuthUser },
    @Query('course_offering_id') courseOfferingId?: string,
  ) {
    return this.urop.listProductVivaPanelists(this.tenant(req), courseOfferingId);
  }

  @Post('product-viva/panelists')
  @Roles('ExamCell', 'Dean', 'President', 'SuperAdmin', 'CampusAdmin')
  addPanelist(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      user_id: string;
      panel_role: 'VC' | 'INDUSTRY' | 'SHODH' | 'FACULTY';
      course_offering_id?: string;
    },
  ) {
    return this.urop.addProductVivaPanelist(this.tenant(req), body);
  }
}
