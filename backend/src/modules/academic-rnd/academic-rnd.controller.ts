import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AcademicRndService } from './academic-rnd.service';
import { UpsertRndConfigDto } from './dto/upsert-config.dto';
import { SubmitRndApplicationDto } from './dto/submit-application.dto';
import {
  RndApprovalActionDto,
  RndRankingDto,
  RndRejectDto,
} from './dto/approval-action.dto';

type AuthUser = {
  user_id: string;
  tenant_id?: string;
  roles?: string[];
};

@Controller('api/academic-rnd')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AcademicRndController {
  constructor(private readonly rnd: AcademicRndService) {}

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  @Get('config/active')
  @Roles('Student', 'Faculty', 'IQAC', 'Dean', 'SuperAdmin', 'Accountant')
  activeConfig(@Req() req: { user: AuthUser }) {
    return this.rnd.getActiveConfig(this.tenant(req));
  }

  @Get('config')
  @Roles('IQAC', 'Dean', 'SuperAdmin')
  listConfig(@Req() req: { user: AuthUser }) {
    return this.rnd.listConfigs(this.tenant(req));
  }

  @Post('config')
  @Roles('IQAC', 'Dean', 'SuperAdmin')
  upsertConfig(
    @Req() req: { user: AuthUser },
    @Body() dto: UpsertRndConfigDto,
  ) {
    return this.rnd.upsertConfig(this.tenant(req), dto);
  }

  @Post('applications')
  @Roles('Student')
  submit(@Req() req: { user: AuthUser }, @Body() dto: SubmitRndApplicationDto) {
    return this.rnd.submitApplication(this.tenant(req), req.user.user_id, dto);
  }

  @Get('applications/mine')
  @Roles('Student')
  myApplications(@Req() req: { user: AuthUser }) {
    return this.rnd.listMyApplications(this.tenant(req), req.user.user_id);
  }

  @Get('applications')
  @Roles('IQAC', 'Dean', 'SuperAdmin')
  allApplications(@Req() req: { user: AuthUser }) {
    return this.rnd.listAllApplications(this.tenant(req));
  }

  @Get('approvals/guide/pending')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  guideQueue(@Req() req: { user: AuthUser }) {
    return this.rnd.listGuideQueue(this.tenant(req), req.user.user_id);
  }

  @Post('approvals/guide/:id/approve')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  approveGuide(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: RndApprovalActionDto,
  ) {
    return this.rnd.approveGuide(this.tenant(req), req.user.user_id, id, dto);
  }

  @Post('approvals/guide/:id/reject')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  rejectGuide(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: RndRejectDto,
  ) {
    return this.rnd.rejectGuide(
      this.tenant(req),
      req.user.user_id,
      id,
      dto.remarks,
    );
  }

  @Get('approvals/budget/pending')
  @Roles('Accountant', 'Dean', 'SuperAdmin', 'IQAC')
  budgetQueue(@Req() req: { user: AuthUser }) {
    return this.rnd.listBudgetQueue(this.tenant(req));
  }

  @Post('approvals/budget/:id/approve')
  @Roles('Accountant', 'Dean', 'SuperAdmin')
  approveBudget(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: RndApprovalActionDto,
  ) {
    return this.rnd.approveBudget(this.tenant(req), req.user.user_id, id, dto);
  }

  @Post('approvals/budget/:id/reject')
  @Roles('Accountant', 'Dean', 'SuperAdmin')
  rejectBudget(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: RndRejectDto,
  ) {
    return this.rnd.rejectBudget(
      this.tenant(req),
      req.user.user_id,
      id,
      dto.remarks,
    );
  }

  @Get('approvals/ranking/pending')
  @Roles('IQAC', 'Dean', 'SuperAdmin')
  rankingQueue(@Req() req: { user: AuthUser }) {
    return this.rnd.listRankingQueue(this.tenant(req));
  }

  @Post('approvals/ranking/:id')
  @Roles('IQAC', 'Dean', 'SuperAdmin')
  submitRanking(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: RndRankingDto,
  ) {
    return this.rnd.submitRanking(this.tenant(req), req.user.user_id, id, dto);
  }

  @Get('report/export')
  @Roles('IQAC', 'Dean', 'SuperAdmin')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  async exportReport(@Req() req: { user: AuthUser }, @Res() res: Response) {
    const buffer = await this.rnd.exportNaacReport(this.tenant(req));
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="student-rnd-naac-report.xlsx"',
    );
    res.send(buffer);
  }
}
