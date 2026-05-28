import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdmissionsService } from './admissions.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadStageDto } from './dto/update-lead-stage.dto';

@Controller('admissions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdmissionsController {
  constructor(private readonly admissions: AdmissionsService) {}

  @Get('leads')
  listLeads(@Query('stage') stage?: string) {
    return this.admissions.listLeads(stage);
  }

  @Post('leads')
  @Roles('Admin', 'AdmissionsOfficer')
  createLead(@Body() dto: CreateLeadDto) {
    return this.admissions.createLead(dto);
  }

  @Patch('leads/:id/stage')
  @Roles('Admin', 'AdmissionsOfficer')
  updateStage(@Param('id') id: string, @Body() dto: UpdateLeadStageDto) {
    return this.admissions.updateLeadStage(id, dto);
  }

  @Get('applications')
  listApplications() {
    return this.admissions.listApplications();
  }

  @Get('applications/:id/documents')
  listDocs(@Param('id') id: string) {
    return this.admissions.listDocumentsForApplication(id);
  }
}
