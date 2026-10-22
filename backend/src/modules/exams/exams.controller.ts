import {
  Body,
  Controller,
  Get,
  ParseIntPipe,
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
import { ExamsService } from './exams.service';
import { CreateExamApplicationDto } from './dto/create-exam-application.dto';
import { requireTenantId } from '../../common/utils/require-tenant-id';

type AuthUser = { user_id: string; role?: string; tenant_id?: string };

@Controller('api/academics/exams')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExamsController {
  constructor(private readonly exams: ExamsService) {}

  @Get('schedule')
  @Roles('Student')
  schedule(
    @Req() req: { user: AuthUser },
    @Query('semester', new ParseIntPipe({ optional: true })) semester?: number,
  ) {
    return this.exams.listUpcomingSchedulesForStudent(
      requireTenantId(req.user.tenant_id),
      req.user.user_id,
      semester,
    );
  }

  @Get('eligibility')
  @Roles('Student')
  eligibility(@Req() req: { user: AuthUser }) {
    return this.exams.checkEligibility(
      requireTenantId(req.user.tenant_id),
      req.user.user_id,
    );
  }

  @Get('admit-card')
  @Roles('Student')
  async admitCard(@Req() req: { user: AuthUser }, @Res() res: Response) {
    const pdf = await this.exams.generateAdmitCardOrThrow(
      requireTenantId(req.user.tenant_id),
      req.user.user_id,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="admit-card.pdf"',
    );
    res.send(pdf);
  }

  @Get('applications/my')
  @Roles('Student')
  myApplications(@Req() req: { user: AuthUser }) {
    return this.exams.listMyApplications(
      requireTenantId(req.user.tenant_id),
      req.user.user_id,
    );
  }

  @Post('applications')
  @Roles('Student')
  apply(@Req() req: { user: AuthUser }, @Body() dto: CreateExamApplicationDto) {
    return this.exams.createApplication(
      requireTenantId(req.user.tenant_id),
      req.user.user_id,
      dto,
    );
  }

  @Get('re-evaluation-sources')
  @Roles('Student')
  reEvaluationSources(@Req() req: { user: AuthUser }) {
    return this.exams.listReEvaluationSources(
      requireTenantId(req.user.tenant_id),
      req.user.user_id,
    );
  }
}
