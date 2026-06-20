import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { StreamableFile } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdmissionsService } from './admissions.service';
import { StudentBulkService } from './student-bulk.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadStageDto } from './dto/update-lead-stage.dto';

type AuthUser = { user_id: string; tenant_id?: string };

@Controller('admissions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdmissionsController {
  constructor(
    private readonly admissions: AdmissionsService,
    private readonly studentBulk: StudentBulkService,
  ) {}

  private tenant(req: { user: AuthUser }): string {
    if (!req.user.tenant_id)
      throw new BadRequestException('Tenant context required');
    return req.user.tenant_id;
  }

  @Get('leads')
  listLeads(@Query('stage') stage?: string) {
    return this.admissions.listLeads(stage);
  }

  @Post('leads')
  @Roles('SuperAdmin', 'AdmissionsOfficer')
  createLead(@Body() dto: CreateLeadDto) {
    return this.admissions.createLead(dto);
  }

  @Patch('leads/:id/stage')
  @Roles('SuperAdmin', 'AdmissionsOfficer')
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

  @Get('students/bulk-upload/template')
  @Roles('SuperAdmin', 'Registrar', 'AdmissionsOfficer')
  async studentBulkTemplate(@Res({ passthrough: true }) res: Response) {
    const buffer = await this.studentBulk.buildTemplateBuffer();
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition':
        'attachment; filename="student-bulk-upload-template.xlsx"',
    });
    return new StreamableFile(buffer);
  }

  @Post('students/bulk-upload')
  @Roles('SuperAdmin', 'Registrar', 'AdmissionsOfficer')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  async studentBulkUpload(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: { user: AuthUser },
    @Query('rule_id') ruleId?: string,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.studentBulk.processBulkUpload(
      this.tenant(req),
      req.user.user_id,
      file.buffer,
      file.originalname,
      ruleId,
    );
  }
}
