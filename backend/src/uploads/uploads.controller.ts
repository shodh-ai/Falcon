import {
  Controller,
  Post,
  Get,
  Query,
  Res,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
  UnauthorizedException,
  UseGuards,
  NotFoundException,
  Req,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ObjectStorageService } from '../storage/object-storage.service';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { basename, relative, resolve, sep } from 'path';
import type { Response } from 'express';
import { UploadsService } from './uploads.service';
import {
  isFileWithinRoot,
  needsStudentFileOwnership,
  SHARED_UPLOAD_ROLES,
  type UploadUser,
} from './upload-file-access';
import { requireTenantId } from '../common/utils/require-tenant-id';

/** Authenticated campus roles that may upload files through the shared endpoint. */
const UPLOAD_ROLES = SHARED_UPLOAD_ROLES;

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'image/jpg',
];

const multerOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB — IQAC evidence / shared uploads
  fileFilter: (
    _req: unknown,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new BadRequestException(
          'Invalid file type. Only PDF, DOC, DOCX, PPT, PPTX, JPG, JPEG, PNG are allowed.',
        ),
        false,
      );
    }
  },
};

type AuthRequest = { user?: UploadUser };

@Controller(['uploads', 'api/uploads'])
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...UPLOAD_ROLES)
export class UploadsController {
  constructor(
    private readonly objectStorage: ObjectStorageService,
    private readonly uploads: UploadsService,
  ) {}

  @Post('single')
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async uploadSingle(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthRequest,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.persistFile(file, req.user);
  }

  @Post('multiple')
  @UseInterceptors(FilesInterceptor('files', 10, multerOptions))
  async uploadMultiple(
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: AuthRequest,
  ) {
    if (!files?.length) {
      throw new BadRequestException('No files uploaded');
    }
    return Promise.all(files.map((f) => this.persistFile(f, req.user)));
  }

  @Get('download')
  @Roles(...UPLOAD_ROLES, 'Applicant')
  async downloadFile(
    @Query('path') filePath: string,
    @Query('key') objectKey: string,
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    // Class-level JwtAuthGuard applies before storage or ownership is inspected.
    if (!req.user) {
      throw new UnauthorizedException(
        'Authentication required to download files',
      );
    }

    const tenantId = requireTenantId(req.user.tenant_id);
    const keyReference =
      objectKey ||
      (filePath?.startsWith('s3://') || filePath?.startsWith(`${tenantId}/`)
        ? filePath
        : undefined);
    if (keyReference?.startsWith('s3://')) {
      let stored: URL;
      try {
        stored = new URL(keyReference);
      } catch {
        throw new NotFoundException('File not found');
      }
      if (
        stored.hostname !== this.objectStorage.getBucketName() ||
        stored.username || stored.password || stored.search || stored.hash
      ) {
        throw new NotFoundException('File not found');
      }
    }
    if (keyReference && this.objectStorage.isEnabled()) {
      const key = this.uploads.canonicalKey(keyReference, tenantId);
      if (!key) {
        throw new NotFoundException('File not found');
      }
      await this.uploads.assertStudentDownloadAccess(req.user, key);
      const stream = await this.objectStorage.getDownloadStream(key);
      this.setDownloadHeaders(res, key);
      return stream.pipe(res);
    }

    if (!filePath && !objectKey) {
      throw new BadRequestException('File path or object key is required');
    }

    const uploadRoot = resolve(this.uploads.getUploadPath());
    const key = this.uploads.canonicalKey(objectKey || filePath, tenantId);
    if (!key) throw new NotFoundException('File not found');
    const resolvedPath = resolve(uploadRoot, key);
    const tenantRoot = resolve(uploadRoot, tenantId);
    if (
      !isFileWithinRoot(uploadRoot, resolvedPath) ||
      !isFileWithinRoot(tenantRoot, resolvedPath) ||
      !existsSync(resolvedPath)
    ) {
      throw new NotFoundException('File not found');
    }

    await this.uploads.assertStudentDownloadAccess(req.user, key);

    this.setDownloadHeaders(res, resolvedPath);
    return createReadStream(resolvedPath).pipe(res);
  }

  private setDownloadHeaders(res: Response, filePath: string): void {
    const contentTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
    };
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${basename(filePath)}"`,
    );
    res.setHeader(
      'Content-Type',
      contentTypes[extname(filePath).toLowerCase()] ??
        'application/octet-stream',
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
  }

  private async persistFile(file: Express.Multer.File, user?: UploadUser) {
    const tenantId = requireTenantId(user?.tenant_id);
    const studentOwner =
      user && needsStudentFileOwnership(user) ? user.user_id : undefined;
    if (user && needsStudentFileOwnership(user) && !studentOwner)
      throw new UnauthorizedException('Student identity required');
    const uniqueName = `${uuidv4()}${extname(file.originalname)}`;

    if (this.objectStorage.isEnabled()) {
      // Keep Student ownership stable while retaining the existing staff layout.
      const key = studentOwner
        ? `${tenantId}/students/${studentOwner}/${uniqueName}`
        : this.objectStorage.buildKey(tenantId, uniqueName);
      const stored = await this.objectStorage.upload(
        tenantId,
        key,
        file.buffer,
        file.mimetype,
      );
      return {
        filename: uniqueName,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        key: stored.key,
        url: stored.url,
        storage: 's3',
      };
    }

    const uploadPath = this.uploads.getUploadPath();
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const folder = studentOwner
      ? `${tenantId}/students/${studentOwner}`
      : `${tenantId}/${year}/${month}`;
    const relativePath = `${folder}/${uniqueName}`;
    const targetDir = resolve(uploadPath, folder);
    mkdirSync(targetDir, { recursive: true });
    const fullPath = `${targetDir}/${uniqueName}`;
    writeFileSync(fullPath, file.buffer);
    const publicUrl = `/uploads/${relativePath}`;

    return {
      filename: uniqueName,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: fullPath,
      url: publicUrl,
      storage: 'disk',
    };
  }
}
