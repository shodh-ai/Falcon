import {
  Body,
  Controller,
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
import { PlacementService } from './placement.service';
import type { PlacementPipelineStage } from './placement.constants';

type AuthUser = { user_id: string; tenant_id?: string };

@Controller(['api/placement', 'placements'])
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlacementController {
  constructor(private readonly placement: PlacementService) {}

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  @Get('companies')
  @Roles('SuperAdmin', 'PlacementCell', 'Registrar')
  companies(@Req() req: { user: AuthUser }) {
    return this.placement.companies(this.tenant(req));
  }

  @Post('companies')
  @Roles('SuperAdmin', 'PlacementCell')
  createCompany(@Req() req: { user: AuthUser }, @Body() dto: Record<string, unknown>) {
    return this.placement.createCompany(this.tenant(req), dto);
  }

  @Get('drives')
  @Roles('SuperAdmin', 'PlacementCell', 'Student')
  drives(
    @Req() req: { user: AuthUser },
    @Query('active') active?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.placement.drives(this.tenant(req), active === 'true', {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get('drives/:driveId')
  @Roles('SuperAdmin', 'PlacementCell', 'Student')
  getDrive(@Req() req: { user: AuthUser }, @Param('driveId') driveId: string) {
    return this.placement.getDrive(this.tenant(req), driveId);
  }

  @Post('drives')
  @Roles('SuperAdmin', 'PlacementCell')
  createDrive(@Req() req: { user: AuthUser }, @Body() dto: Record<string, unknown>) {
    return this.placement.createDrive(this.tenant(req), dto);
  }

  @Patch('drives/:driveId')
  @Roles('SuperAdmin', 'PlacementCell')
  updateDrive(
    @Req() req: { user: AuthUser },
    @Param('driveId') driveId: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.placement.updateDrive(this.tenant(req), driveId, dto);
  }

  @Get('drives/:driveId/eligibility')
  @Roles('SuperAdmin', 'PlacementCell', 'Student')
  eligibility(@Req() req: { user: AuthUser }, @Param('driveId') driveId: string) {
    return this.placement.checkEligibility(req.user.user_id, driveId, this.tenant(req));
  }

  @Post('drives/:driveId/apply')
  @Roles('Student', 'SuperAdmin', 'PlacementCell')
  apply(
    @Req() req: { user: AuthUser },
    @Param('driveId') driveId: string,
    @Body() body: { resume_file_path?: string },
  ) {
    return this.placement.applyToDrive(
      this.tenant(req),
      req.user.user_id,
      driveId,
      body?.resume_file_path,
    );
  }

  @Get('drives/:driveId/pipeline')
  @Roles('SuperAdmin', 'PlacementCell')
  pipeline(@Req() req: { user: AuthUser }, @Param('driveId') driveId: string) {
    return this.placement.getDrivePipeline(this.tenant(req), driveId);
  }

  @Get('drives/:driveId/export')
  @Roles('SuperAdmin', 'PlacementCell')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async exportApplicants(
    @Req() req: { user: AuthUser },
    @Param('driveId') driveId: string,
    @Query('stage') stage: PlacementPipelineStage,
    @Res() res: Response,
  ) {
    const buffer = await this.placement.exportDriveApplicants(
      this.tenant(req),
      driveId,
      stage ?? 'APPLIED',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="drive-${driveId}-${stage ?? 'APPLIED'}.xlsx"`,
    );
    res.send(buffer);
  }

  @Patch('applications/:applicationId/stage')
  @Roles('SuperAdmin', 'PlacementCell')
  updateStage(
    @Req() req: { user: AuthUser },
    @Param('applicationId') applicationId: string,
    @Body() body: { stage: PlacementPipelineStage; rejected_at_stage?: PlacementPipelineStage },
  ) {
    return this.placement.updateApplicationStage(
      this.tenant(req),
      applicationId,
      body.stage,
      body.rejected_at_stage,
    );
  }

  @Get('student/hub')
  @Roles('Student', 'SuperAdmin', 'PlacementCell')
  studentHub(@Req() req: { user: AuthUser }) {
    return this.placement.getStudentPlacementsHub(this.tenant(req), req.user.user_id);
  }

  @Get('jobs')
  jobs(@Req() req: { user: AuthUser }) {
    return this.placement.jobs(this.tenant(req));
  }

  @Get('resumes')
  @Roles('SuperAdmin', 'PlacementCell')
  resumes(@Req() req: { user: AuthUser }) {
    return this.placement.resumes(this.tenant(req));
  }

  @Post('resumes/:studentUserId/generate')
  @Roles('Student', 'SuperAdmin', 'PlacementCell')
  generateResume(@Req() req: { user: AuthUser }, @Param('studentUserId') studentUserId: string) {
    return this.placement.generateResumePdf(this.tenant(req), studentUserId);
  }

  @Get('mock-interviews')
  mockInterviews(@Req() req: { user: AuthUser }) {
    return this.placement.mockInterviews(this.tenant(req));
  }

  @Get('skill-matrix')
  skillMatrix(@Req() req: { user: AuthUser }) {
    return this.placement.skillMatrix(req.user.user_id);
  }

  @Get('training-sessions')
  trainingSessions(@Req() req: { user: AuthUser }) {
    return this.placement.trainingSessions(this.tenant(req));
  }
}
