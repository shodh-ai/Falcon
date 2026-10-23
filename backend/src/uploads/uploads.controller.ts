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
import { createReadStream } from 'fs';
import { basename } from 'path';
import type { Response } from 'express';
import {
  isSafeStorageKey,
  isSafeTenantId,
  resolveTenantDiskPath,
} from '../storage/disk-file-path';

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
    return this.persistFile(file, this.requireTenant(req));
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
    const tenantId = this.requireTenant(req);
    return Promise.all(files.map((f) => this.persistFile(f, tenantId)));
  }

  @Get('download')
  async downloadFile(
    @Query('path') filePath: string,
    @Query('key') objectKey: string,
    @Req() req: AuthRequest & { user?: { tenant_id?: string } },
    @Res() res: Response,
  ) {
    // Class-level JwtAuthGuard applies (Bearer or auth cookie).
    const tenantId = this.requireTenant(req);

    if (objectKey) {
      // Object keys are tenant-prefixed by ObjectStorageService.buildKey
      if (!isSafeStorageKey(objectKey, tenantId)) {
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

    const resolvedPath = resolveTenantDiskPath(filePath, tenantId);
    if (!resolvedPath) throw new NotFoundException('File not found');

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
    const key = this.objectStorage.buildKey(tenantId, uniqueName);
    const stored = await this.objectStorage.upload(
      tenantId,
      key,
      file.buffer,
      file.mimetype,
    );

    if (this.objectStorage.isEnabled()) {
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

    return {
      filename: uniqueName,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: `${process.env.UPLOAD_PATH || './uploads'}/${key}`,
      url: stored.url,
      storage: 'disk',
    };
  }

  private requireTenant(req: AuthRequest): string {
    const tenantId = req.user?.tenant_id;
    if (!tenantId || !isSafeTenantId(tenantId)) {
      throw new UnauthorizedException(
        'Authentication with tenant context required',
      );
    }
    return tenantId;
  }
}
