import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
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

type AuthUser = { user_id: string; tenant_id?: string };

const DOC_TYPES = ['AADHAAR', '10TH_MARKSHEET', '12TH_MARKSHEET', 'PHOTO'] as const;

@Controller('api/student/onboarding')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Student', 'Applicant')
export class StudentOnboardingController {
  constructor(
    private readonly onboarding: StudentOnboardingService,
    private readonly objectStorage: ObjectStorageService,
  ) {}

  @Get('status')
  status(@Req() req: { user: AuthUser }) {
    return this.onboarding.getStatus(this.tenant(req), req.user.user_id);
  }

  @Post('reset-password')
  resetPassword(
    @Req() req: { user: AuthUser },
    @Body() body: { current_password: string; new_password: string; confirm_password?: string },
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

  @Get('profile')
  profile(@Req() req: { user: AuthUser }) {
    return this.onboarding.getStep2Profile(this.tenant(req), req.user.user_id);
  }

  @Post('profile')
  saveProfile(
    @Req() req: { user: AuthUser },
    @Body() body: { blood_group?: string; parent_contact_phone?: string; abc_id?: string },
  ) {
    return this.onboarding.saveStep2Profile(this.tenant(req), req.user.user_id, body);
  }

  @Post('documents/:docType')
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  async uploadDocument(
    @Req() req: { user: AuthUser },
    @Param('docType') docType: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const normalized = docType.toUpperCase().replace(/-/g, '_');
    if (!DOC_TYPES.includes(normalized as (typeof DOC_TYPES)[number])) {
      throw new BadRequestException('Invalid document type');
    }
    const storedPath = await this.persistFile(file, this.tenant(req));
    return this.onboarding.registerDocument(
      this.tenant(req),
      req.user.user_id,
      normalized as (typeof DOC_TYPES)[number],
      storedPath,
    );
  }

  @Post('submit')
  submit(@Req() req: { user: AuthUser }) {
    return this.onboarding.submitForVerification(this.tenant(req), req.user.user_id);
  }

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? '';
  }

  private async persistFile(file: Express.Multer.File, tenantId: string): Promise<string> {
    if (!file) throw new BadRequestException('No file uploaded');
    const uniqueName = `${uuidv4()}${extname(file.originalname)}`;

    if (this.objectStorage.isEnabled()) {
      const key = this.objectStorage.buildKey(tenantId, uniqueName);
      const stored = await this.objectStorage.upload(tenantId, key, file.buffer, file.mimetype);
      return stored.url ?? stored.key;
    }

    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const targetDir = `${uploadPath}/${tenantId}/${year}/${month}`;
    if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
    const fullPath = `${targetDir}/${uniqueName}`;
    await new Promise<void>((resolve, reject) => {
      const stream = createWriteStream(fullPath);
      stream.on('finish', () => resolve());
      stream.on('error', reject);
      stream.end(file.buffer);
    });
    return fullPath;
  }
}

@Controller('api/admin/student-verifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SuperAdmin', 'AdmissionsOfficer', 'Registrar')
export class StudentVerificationAdminController {
  constructor(
    private readonly onboarding: StudentOnboardingService,
    private readonly objectStorage: ObjectStorageService,
  ) {}

  @Get('queue')
  queue(@Req() req: { user: AuthUser }) {
    return this.onboarding.getVerificationQueue(req.user.tenant_id ?? '');
  }

  @Get(':studentUserId')
  detail(@Req() req: { user: AuthUser }, @Param('studentUserId') studentUserId: string) {
    return this.onboarding.getVerificationDetail(req.user.tenant_id ?? '', studentUserId);
  }

  @Post(':studentUserId/approve')
  approve(@Req() req: { user: AuthUser }, @Param('studentUserId') studentUserId: string) {
    return this.onboarding.approve(req.user.tenant_id ?? '', studentUserId);
  }

  @Post(':studentUserId/reject')
  reject(
    @Req() req: { user: AuthUser },
    @Param('studentUserId') studentUserId: string,
    @Body() body: { remarks: string },
  ) {
    return this.onboarding.reject(req.user.tenant_id ?? '', studentUserId, body.remarks);
  }

  @Get(':studentUserId/documents/:docType/preview')
  async previewDocument(
    @Req() req: { user: AuthUser },
    @Param('studentUserId') studentUserId: string,
    @Param('docType') docType: string,
    @Res() res: Response,
  ) {
    const filePath = await this.onboarding.getDocumentPath(
      req.user.tenant_id ?? '',
      studentUserId,
      docType.toUpperCase().replace(/-/g, '_'),
    );

    if (filePath.startsWith('http')) {
      return res.redirect(filePath);
    }

    if (this.objectStorage.isEnabled() && !filePath.startsWith('/')) {
      const stream = await this.objectStorage.getDownloadStream(filePath);
      res.setHeader('Content-Disposition', `inline; filename="${basename(filePath)}"`);
      return stream.pipe(res);
    }

    const uploadRoot = resolve(process.env.UPLOAD_PATH || './uploads');
    const resolvedPath = resolve(filePath);
    if (!resolvedPath.startsWith(uploadRoot) || !existsSync(resolvedPath)) {
      throw new BadRequestException('File not found');
    }
    res.setHeader('Content-Disposition', `inline; filename="${basename(resolvedPath)}"`);
    return createReadStream(resolvedPath).pipe(res);
  }
}
