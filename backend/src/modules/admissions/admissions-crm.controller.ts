import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdmissionsService } from './admissions.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadStageDto } from './dto/update-lead-stage.dto';

type AuthUser = { user_id: string; tenant_id?: string };

@Controller('api/admissions-crm')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SuperAdmin', 'AdmissionsOfficer', 'Registrar')
export class AdmissionsCrmController {
  constructor(private readonly admissions: AdmissionsService) {}

  @Get('kanban')
  kanban(@Req() req: { user: AuthUser }) {
    return this.admissions.kanbanBoard(this.tenant(req));
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

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }
}
