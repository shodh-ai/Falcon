import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream, createWriteStream, existsSync, mkdirSync } from 'fs';
import { basename, extname, resolve } from 'path';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ObjectStorageService } from '../../storage/object-storage.service';
import { StudentOnboardingService } from './student-onboarding.service';
import {
  getRequiredDocTypes,
  STAFF_ONBOARDING_DOC_TYPES,
  STUDENT_ONBOARDING_DOC_TYPES,
} from './onboarding-portal.util';

type AuthUser = { user_id: string; tenant_id?: string };

type ProfileBody = {
  blood_group?: string;
  parent_contact_phone?: string;
  abc_id?: string;
  pan_number?: string;
  aadhaar_number?: string;
  bank_account_no?: string;
  ifsc_code?: string;
  pf_uan?: string;
  student_mobile?: string;
  staff_mobile?: string;
  gender?: string;
  date_of_birth?: string;
  father_name?: string;
  mother_name?: string;
  parent_occupation?: string;
  annual_income?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  permanent_address?: string;
  current_address?: string;
  orcid_id?: string;
  scopus_id?: string;
  google_scholar_url?: string;
  total_experience_years?: number | string;
  industry_experience_years?: number | string;
  degree_level?: string;
  degree_name?: string;
  university?: string;
  passing_year?: number | string;
  specialization?: string;
};

abstract class BaseOnboardingController {
  constructor(
    protected readonly onboarding: StudentOnboardingService,
    protected readonly objectStorage: ObjectStorageService,
    protected readonly allowedDocTypes: readonly string[],
  ) {}

  status(@Req() req: { user: AuthUser }) {
    return this.onboarding.getStatus(this.tenant(req), req.user.user_id);
  }

  resetPassword(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      current_password: string;
      new_password: string;
      confirm_password?: string;
    },
  ) {
    if (body.new_password !== body.confirm_password) {
      throw new BadRequestException('Passwords do not match');
    }
    return this.onboarding.resetPassword(
      this.tenant(req),
      req.user.user_id,
      body.current_password,
      body.new_password,
    );
  }

  profile(@Req() req: { user: AuthUser }) {
    return this.onboarding.getStep2Profile(this.tenant(req), req.user.user_id);
  }

  saveProfile(@Req() req: { user: AuthUser }, @Body() body: ProfileBody) {
    return this.onboarding.saveStep2Profile(
      this.tenant(req),
      req.user.user_id,
      body,
    );
  }

  async uploadDocument(
    @Req() req: { user: AuthUser },
    @Param('docType') docType: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const normalized = docType.toUpperCase().replace(/-/g, '_');
    if (!this.allowedDocTypes.includes(normalized)) {
      throw new BadRequestException('Invalid document type');
    }
    const storedPath = await this.persistFile(file, this.tenant(req));
    return this.onboarding.registerDocument(
      this.tenant(req),
      req.user.user_id,
      normalized,
      storedPath,
    );
  }

  submit(@Req() req: { user: AuthUser }) {
    return this.onboarding.submitForVerification(
      this.tenant(req),
      req.user.user_id,
    );
  }

  protected tenant(req: { user: AuthUser }) {
    return this.onboarding.resolveTenantId(req.user.tenant_id);
  }

  protected async persistFile(
    file: Express.Multer.File,
    tenantId: string,
  ): Promise<string> {
    if (!file) throw new BadRequestException('No file uploaded');
    const uniqueName = `${uuidv4()}${extname(file.originalname)}`;

    if (this.objectStorage.isEnabled()) {
      const key = this.objectStorage.buildKey(tenantId, uniqueName);
      const stored = await this.objectStorage.upload(
        tenantId,
        key,
        file.buffer,
        file.mimetype,
      );
      return stored.url ?? stored.key;
    }

    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const targetDir = `${uploadPath}/${tenantId}/${year}/${month}`;
    if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
    const fullPath = `${targetDir}/${uniqueName}`;
    await new Promise<void>((resolvePromise, reject) => {
      const stream = createWriteStream(fullPath);
      stream.on('finish', () => resolvePromise());
      stream.on('error', reject);
      stream.end(file.buffer);
    });
    return fullPath;
  }
}

@Controller('api/student/onboarding')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Student', 'Applicant')
export class StudentOnboardingController extends BaseOnboardingController {
  constructor(
    onboarding: StudentOnboardingService,
    objectStorage: ObjectStorageService,
  ) {
    super(onboarding, objectStorage, STUDENT_ONBOARDING_DOC_TYPES);
  }

  @Get('status')
  status(@Req() req: { user: AuthUser }) {
    return super.status(req);
  }

  @Post('reset-password')
  resetPassword(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      current_password: string;
      new_password: string;
      confirm_password?: string;
    },
  ) {
    return super.resetPassword(req, body);
  }

  @Get('profile')
  profile(@Req() req: { user: AuthUser }) {
    return super.profile(req);
  }

  @Post('profile')
  saveProfile(@Req() req: { user: AuthUser }, @Body() body: ProfileBody) {
    return super.saveProfile(req, body);
  }

  @Post('documents/:docType')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadDocument(
    @Req() req: { user: AuthUser },
    @Param('docType') docType: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return super.uploadDocument(req, docType, file);
  }

  @Post('submit')
  submit(@Req() req: { user: AuthUser }) {
    return super.submit(req);
  }
}

@Controller('api/staff/onboarding')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Faculty', 'HOD', 'Dean')
export class StaffOnboardingController extends BaseOnboardingController {
  constructor(
    onboarding: StudentOnboardingService,
    objectStorage: ObjectStorageService,
  ) {
    super(onboarding, objectStorage, STAFF_ONBOARDING_DOC_TYPES);
  }

  @Get('status')
  status(@Req() req: { user: AuthUser }) {
    return super.status(req);
  }

  @Post('reset-password')
  resetPassword(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      current_password: string;
      new_password: string;
      confirm_password?: string;
    },
  ) {
    return super.resetPassword(req, body);
  }

  @Get('profile')
  profile(@Req() req: { user: AuthUser }) {
    return super.profile(req);
  }

  @Post('profile')
  saveProfile(@Req() req: { user: AuthUser }, @Body() body: ProfileBody) {
    return super.saveProfile(req, body);
  }

  @Post('documents/:docType')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadDocument(
    @Req() req: { user: AuthUser },
    @Param('docType') docType: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return super.uploadDocument(req, docType, file);
  }

  @Post('submit')
  submit(@Req() req: { user: AuthUser }) {
    return super.submit(req);
  }
}

@Controller('api/admin/student-verifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CampusAdmin', 'SuperAdmin', 'AdmissionsOfficer', 'Registrar', 'HR', 'HRAdmin')
export class StudentVerificationAdminController {
  constructor(
    private readonly onboarding: StudentOnboardingService,
    private readonly objectStorage: ObjectStorageService,
  ) {}

  private tenant(req: { user: AuthUser }) {
    return this.onboarding.resolveTenantId(req.user.tenant_id);
  }

  @Get('queue')
  queue(
    @Req() req: { user: AuthUser },
    @Query('portal_kind') portalKind?: 'student' | 'staff' | 'all',
  ) {
    return this.onboarding.getVerificationQueue(
      this.tenant(req),
      portalKind ?? 'all',
    );
  }

  @Get(':targetUserId')
  detail(
    @Req() req: { user: AuthUser },
    @Param('targetUserId') targetUserId: string,
  ) {
    return this.onboarding.getVerificationDetail(
      this.tenant(req),
      targetUserId,
    );
  }

  @Post(':targetUserId/approve')
  approve(
    @Req() req: { user: AuthUser },
    @Param('targetUserId') targetUserId: string,
  ) {
    return this.onboarding.approve(this.tenant(req), targetUserId);
  }

  @Post(':targetUserId/reject')
  reject(
    @Req() req: { user: AuthUser },
    @Param('targetUserId') targetUserId: string,
    @Body() body: { remarks: string },
  ) {
    return this.onboarding.reject(this.tenant(req), targetUserId, body.remarks);
  }

  @Get(':targetUserId/documents/:docType/preview')
  async previewDocument(
    @Req() req: { user: AuthUser },
    @Param('targetUserId') targetUserId: string,
    @Param('docType') docType: string,
    @Res() res: Response,
  ) {
    const filePath = await this.onboarding.getDocumentPath(
      this.tenant(req),
      targetUserId,
      docType.toUpperCase().replace(/-/g, '_'),
    );

    if (filePath.startsWith('http')) {
      return res.redirect(filePath);
    }

    if (this.objectStorage.isEnabled() && !filePath.startsWith('/')) {
      const stream = await this.objectStorage.getDownloadStream(filePath);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${basename(filePath)}"`,
      );
      return stream.pipe(res);
    }

    const uploadRoot = resolve(process.env.UPLOAD_PATH || './uploads');
    const resolvedPath = resolve(filePath);
    if (!resolvedPath.startsWith(uploadRoot) || !existsSync(resolvedPath)) {
      throw new BadRequestException('File not found');
    }
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${basename(resolvedPath)}"`,
    );
    return createReadStream(resolvedPath).pipe(res);
  }
}
