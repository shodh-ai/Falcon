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
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ObjectStorageService } from '../storage/object-storage.service';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { basename, resolve } from 'path';
import type { Response } from 'express';

/** Authenticated campus roles that may upload files through the shared endpoint. */
const UPLOAD_ROLES = [
  'Student',
  'Faculty',
  'HOD',
  'Dean',
  'SuperAdmin',
  'Admin',
  'IQAC',
  'HR',
  'HRAdmin',
  'Registrar',
  'President',
  'ExamCell',
  'Accountant',
  'HostelAdmin',
] as const;

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

type AuthRequest = { user?: { tenant_id?: string } };

@Controller(['uploads', 'api/uploads'])
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...UPLOAD_ROLES)
export class UploadsController {
  constructor(private readonly objectStorage: ObjectStorageService) {}

  @Post('single')
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async uploadSingle(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthRequest,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.persistFile(file, req.user?.tenant_id ?? 'unknown');
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
    const tenantId = req.user?.tenant_id ?? 'unknown';
    return Promise.all(files.map((f) => this.persistFile(f, tenantId)));
  }

  @Get('download')
  async downloadFile(
    @Query('path') filePath: string,
    @Query('key') objectKey: string,
    @Req() req: AuthRequest & { user?: { tenant_id?: string } },
    @Res() res: Response,
  ) {
    // Class-level JwtAuthGuard applies (Bearer, access_token query, or auth cookie).
    if (!req.user) {
      throw new UnauthorizedException(
        'Authentication required to download files',
      );
    }

    if (objectKey && this.objectStorage.isEnabled()) {
      const tenantId = req.user.tenant_id;
      // Object keys are tenant-prefixed by ObjectStorageService.buildKey
      if (tenantId && !objectKey.startsWith(`${tenantId}/`)) {
        throw new NotFoundException('File not found');
      }
      const stream = await this.objectStorage.getDownloadStream(objectKey);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${basename(objectKey)}"`,
      );
      if (objectKey.endsWith('.pdf')) {
        res.setHeader('Content-Type', 'application/pdf');
      }
      return stream.pipe(res);
    }

    if (!filePath) {
      throw new BadRequestException('File path or object key is required');
    }

    const uploadRoot = resolve(process.env.UPLOAD_PATH || './uploads');
    let resolvedPath = resolve(filePath);

    if (filePath.startsWith('/uploads/')) {
      resolvedPath = resolve(uploadRoot, filePath.replace(/^\/uploads\//, ''));
    }

    if (!resolvedPath.startsWith(uploadRoot) || !existsSync(resolvedPath)) {
      throw new NotFoundException('File not found');
    }

    const tenantId = req.user.tenant_id;
    if (tenantId) {
      const tenantRoot = resolve(uploadRoot, tenantId);
      if (!resolvedPath.startsWith(tenantRoot)) {
        throw new NotFoundException('File not found');
      }
    }

    res.setHeader(
      'Content-Disposition',
      `inline; filename="${basename(resolvedPath)}"`,
    );
    if (resolvedPath.endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
    }
    return createReadStream(resolvedPath).pipe(res);
  }

  private async persistFile(file: Express.Multer.File, tenantId: string) {
    const uniqueName = `${uuidv4()}${extname(file.originalname)}`;

    if (this.objectStorage.isEnabled()) {
      const key = this.objectStorage.buildKey(tenantId, uniqueName);
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

    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const relativePath = `${tenantId}/${year}/${month}/${uniqueName}`;
    const targetDir = `${uploadPath}/${tenantId}/${year}/${month}`;
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
