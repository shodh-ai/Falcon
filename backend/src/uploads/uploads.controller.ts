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
  UseGuards,
  NotFoundException,
  Req,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ObjectStorageService } from '../storage/object-storage.service';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { basename, resolve } from 'path';
import type { Response } from 'express';

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
  limits: { fileSize: 104857600 },
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
@UseGuards(JwtAuthGuard)
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
    @Res() res: Response,
  ) {
    if (objectKey && this.objectStorage.isEnabled()) {
      const stream = await this.objectStorage.getDownloadStream(objectKey);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${basename(objectKey)}"`,
      );
      return stream.pipe(res);
    }

    if (!filePath) {
      throw new BadRequestException('File path or object key is required');
    }

    const uploadRoot = resolve(process.env.UPLOAD_PATH || './uploads');
    const resolvedPath = resolve(filePath);

    if (!resolvedPath.startsWith(uploadRoot) || !existsSync(resolvedPath)) {
      throw new NotFoundException('File not found');
    }

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${basename(resolvedPath)}"`,
    );
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
