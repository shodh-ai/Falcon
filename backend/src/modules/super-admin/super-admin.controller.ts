import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { EntityCreatorGuard } from '../../common/guards/entity-creator.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { EntityCreatorOnly } from '../../common/decorators/entity-creator.decorator';
import { AllowImpersonationWrite } from '../../common/decorators/allow-impersonation-write.decorator';
import { SuperAdminService } from './super-admin.service';
import { ImpersonationService } from './impersonation.service';
import { OrgEntityService } from './org-entity.service';
import { CreateOrgEntityDto } from './dto/create-org-entity.dto';
import { GrantEntityAccessDto } from './dto/grant-entity-access.dto';
import {
  CourseAllocationBulkService,
  type CourseAllocationRowInput,
} from '../academics/course-allocation-bulk.service';

type AuthUser = {
  user_id: string;
  tenant_id?: string;
  tenant_schema?: string;
  impersonator_user_id?: string;
  impersonation_session_id?: string;
};

@Controller('api/super-admin')
@UseGuards(JwtAuthGuard, RolesGuard, EntityCreatorGuard)
@Roles('SuperAdmin')
export class SuperAdminController {
  constructor(
    private readonly superAdmin: SuperAdminService,
    private readonly impersonation: ImpersonationService,
    private readonly orgEntities: OrgEntityService,
    private readonly courseAllocationBulk: CourseAllocationBulkService,
  ) {}

  @Get('entities')
  @EntityCreatorOnly()
  listEntities(@Req() req: { user: AuthUser }) {
    return this.orgEntities.listEntitiesWithStats(this.tenant(req));
  }

  @Post('entities')
  @EntityCreatorOnly()
  createEntity(
    @Req() req: { user: AuthUser },
    @Body() dto: CreateOrgEntityDto,
  ) {
    return this.orgEntities.createEntity(
      this.tenant(req),
      req.user.user_id,
      dto,
    );
  }

  @Get('entities/grantable-users')
  @EntityCreatorOnly()
  grantableUsers(@Req() req: { user: AuthUser }, @Query('q') q?: string) {
    return this.orgEntities.listGrantableUsers(this.tenant(req), q);
  }

  @Get('entities/:entityId/access')
  @EntityCreatorOnly()
  listEntityAccess(
    @Req() req: { user: AuthUser },
    @Param('entityId', ParseIntPipe) entityId: number,
  ) {
    return this.orgEntities.listEntityAccess(this.tenant(req), entityId);
  }

  @Post('entities/:entityId/access')
  @EntityCreatorOnly()
  grantEntityAccess(
    @Req() req: { user: AuthUser },
    @Param('entityId', ParseIntPipe) entityId: number,
    @Body() dto: GrantEntityAccessDto,
  ) {
    return this.orgEntities.grantAccess(
      this.tenant(req),
      entityId,
      dto.user_id,
      req.user.user_id,
    );
  }

  @Delete('entities/:entityId/access/:userId')
  @EntityCreatorOnly()
  revokeEntityAccess(
    @Req() req: { user: AuthUser },
    @Param('entityId', ParseIntPipe) entityId: number,
    @Param('userId') userId: string,
  ) {
    return this.orgEntities.revokeAccess(this.tenant(req), entityId, userId);
  }

  @Get('hierarchy')
  hierarchy(@Req() req: { user: AuthUser }) {
    return this.superAdmin.getHierarchyTree(this.tenant(req));
  }

  @Post('sections')
  createSection(
    @Req() req: { user: AuthUser },
    @Body()
    dto: {
      section_name: string;
      batch_id?: string;
      program_id?: number;
      capacity?: number;
    },
  ) {
    return this.superAdmin.createSection(this.tenant(req), dto);
  }

  @Get('hierarchy/assignable-users')
  hierarchyAssignableUsers(
    @Req() req: { user: AuthUser },
    @Query('q') q?: string,
  ) {
    return this.superAdmin.listAssignableUsers(this.tenant(req), q);
  }

  @Post('assignments')
  assign(
    @Req() req: { user: AuthUser },
    @Body()
    dto: {
      user_id: string;
      assignment_type: string;
      entity_type: string;
      entity_id: string;
    },
  ) {
    return this.superAdmin.assignEntity(
      this.tenant(req),
      req.user.user_id,
      dto,
    );
  }

  @Post('sections/bulk-assign')
  bulkAssign(
    @Req() req: { user: AuthUser },
    @Body() dto: { section_id: string; student_user_ids: string[] },
  ) {
    return this.superAdmin.bulkAssignSection(
      this.tenant(req),
      req.user.user_id,
      dto.section_id,
      dto.student_user_ids,
    );
  }

  @Get('assignments')
  listAssignments(@Req() req: { user: AuthUser }) {
    return this.superAdmin.listAssignments(this.tenant(req));
  }

  @Get('impersonation/logs')
  impersonationLogs(@Req() req: { user: AuthUser }) {
    return this.superAdmin.listImpersonationSessions(this.tenant(req));
  }

  @Post('impersonate')
  @AllowImpersonationWrite()
  startImpersonation(
    @Req() req: { user: AuthUser },
    @Body() dto: { target_user_id: string; reason?: string },
  ) {
    return this.impersonation.startImpersonation(
      req.user.user_id,
      this.tenant(req),
      req.user.tenant_schema ?? 'public',
      dto.target_user_id,
      dto.reason,
    );
  }

  @Post('impersonate/end')
  @AllowImpersonationWrite()
  endImpersonation(@Req() req: { user: AuthUser }) {
    const sessionId = req.user.impersonation_session_id;
    const actor = req.user.impersonator_user_id ?? req.user.user_id;
    if (!sessionId) return { ended: false, reason: 'not_impersonating' };
    return this.impersonation.endImpersonation(actor, sessionId);
  }

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  @Get('override-logs')
  listOverrideLogs(@Req() req: { user: AuthUser }) {
    return this.superAdmin.listHrOverrideLogs(this.tenant(req));
  }

  @Get('academics/course-mapper/template')
  async courseMapperTemplate(@Res({ passthrough: true }) res: Response) {
    const buffer = await this.courseAllocationBulk.buildTemplateBuffer();
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition':
        'attachment; filename="course-allocation-matrix-template.xlsx"',
    });
    return new StreamableFile(buffer);
  }

  @Post('academics/course-mapper/preview')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async courseMapperPreview(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: { user: AuthUser },
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const rows = await this.courseAllocationBulk.parseUploadFile(
      file.buffer,
      file.originalname,
    );
    return this.courseAllocationBulk.buildPreview(this.tenant(req), rows);
  }

  @Post('academics/course-mapper/execute')
  executeCourseMapper(
    @Req() req: { user: AuthUser },
    @Body()
    dto: { academic_year: string; rows: CourseAllocationRowInput[] },
  ) {
    return this.courseAllocationBulk.executeBulkMap(
      this.tenant(req),
      dto.academic_year,
      dto.rows,
    );
  }

  @Get('academics/course-allocations')
  listAllAllocations(@Req() req: { user: AuthUser }) {
    return this.courseAllocationBulk.listAllAllocations(this.tenant(req));
  }

  @Put('academics/course-allocations/:id/faculty')
  updateAllocationFaculty(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: { faculty_user_id: string | null },
  ) {
    return this.courseAllocationBulk.updateAllocationFaculty(
      this.tenant(req),
      id,
      dto.faculty_user_id,
    );
  }

  @Delete('academics/course-allocations/:id')
  deleteAllocation(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
  ) {
    return this.courseAllocationBulk.deleteAllocation(this.tenant(req), id);
  }
}
