import {
  Body,
  Controller,
  Get,
  ParseIntPipe,
  ParseUUIDPipe,
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
      req.user.user_id,
      requireTenantId(req.user.tenant_id),
      semester,
    );
  }

  @Get('eligibility')
  @Roles('Student')
  eligibility(@Req() req: { user: AuthUser }) {
    return this.exams.checkEligibility(
      req.user.user_id,
      requireTenantId(req.user.tenant_id),
    );
  }

  @Get('admit-card')
  @Roles('Student')
  async admitCard(
    @Req() req: { user: AuthUser },
    @Res() res: Response,
    @Query('entry_id', new ParseUUIDPipe({ optional: true })) entryId?: string,
  ) {
    const pdf = await this.exams.generateAdmitCardOrThrow(
      req.user.user_id,
      requireTenantId(req.user.tenant_id),
      entryId,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="admit-card.pdf"',
    );
    res.send(pdf);
  }

  @Get('admit-cards')
  @Roles('Student')
  issuedAdmitCards(@Req() req: { user: AuthUser }) {
    return this.exams.listIssuedAdmitCards(
      req.user.user_id,
      requireTenantId(req.user.tenant_id),
    );
  }

  @Get('applications/my')
  @Roles('Student')
  myApplications(@Req() req: { user: AuthUser }) {
    return this.exams.listMyApplications(
      req.user.user_id,
      requireTenantId(req.user.tenant_id),
    );
  }

  @Post('applications')
  @Roles('Student')
  apply(@Req() req: { user: AuthUser }, @Body() dto: CreateExamApplicationDto) {
    return this.exams.createApplication(
      req.user.user_id,
      dto,
      requireTenantId(req.user.tenant_id),
    );
  }
}
