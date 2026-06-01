import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { IqacService } from './iqac.service';
import { CreateJobPostingDto } from './dto/create-job-posting.dto';
import { ApplyToJobDto } from './dto/apply-to-job.dto';
import { CreateAlumniRequestDto } from './dto/create-alumni-request.dto';

@Controller('iqac')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IqacController {
  constructor(private readonly iqac: IqacService) {}

  @Get('dashboard')
  @Roles('SuperAdmin', 'IQAC', 'President')
  dashboard() {
    return this.iqac.getDashboard();
  }

  @Get('task-master')
  @Roles('SuperAdmin', 'IQAC')
  listTaskMaster() {
    return this.iqac.listTaskMaster();
  }

  @Post('task-master')
  @Roles('SuperAdmin', 'IQAC')
  createTaskMaster(@Body() dto: { task_name?: string; task_description?: string; role_id?: number; month?: string; is_recurring?: boolean }) {
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
  createJob(@Body() dto: CreateJobPostingDto) {
    return this.iqac.createJob(dto);
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
}
