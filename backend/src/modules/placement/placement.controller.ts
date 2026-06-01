import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PlacementService } from './placement.service';

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
  drives(@Req() req: { user: AuthUser }) {
    return this.placement.drives(this.tenant(req));
  }

  @Post('drives')
  @Roles('SuperAdmin', 'PlacementCell')
  createDrive(@Req() req: { user: AuthUser }, @Body() dto: Record<string, unknown>) {
    return this.placement.createDrive(this.tenant(req), dto);
  }

  @Get('drives/:driveId/eligibility')
  @Roles('SuperAdmin', 'PlacementCell', 'Student')
  eligibility(@Req() req: { user: AuthUser }, @Param('driveId') driveId: string) {
    return this.placement.checkEligibility(req.user.user_id, driveId);
  }

  @Post('drives/:driveId/apply')
  @Roles('Student', 'SuperAdmin', 'PlacementCell')
  apply(@Req() req: { user: AuthUser }, @Param('driveId') driveId: string) {
    return this.placement.applyToDrive(this.tenant(req), req.user.user_id, driveId);
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
