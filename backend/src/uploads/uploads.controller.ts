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
  Body,
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
import {
  createReadStream,
  existsSync,
  mkdirSync,
  realpathSync,
  writeFileSync,
} from 'fs';
import { basename, relative, resolve, sep } from 'path';
import type { Response } from 'express';
import { EXAM_CELL_ACCESS_ROLES } from '../modules/exam-cell/exam-cell.constants';
import { normalizeExamCellRole } from '../modules/exam-cell/exam-cell-rbac.util';
import {
  isCurrentTranscript,
  TranscriptRevisionMetadata,
} from '../modules/exam-cell/official-transcript-revisions';
import { EXAM_CELL_SELF_SERVICE_ROLES } from '../modules/hr/hr-workforce.constants';
import {
  HR_DOCUMENT_UPLOAD_PURPOSE,
  hrUploadOwner,
  isPrivateHrUploadKey,
  ownedHrUploadName,
} from './hr-document-upload.util';

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

type AuthRequest = {
  user?: {
    user_id?: string;
    tenant_id?: string;
    role?: string;
    primaryRole?: string;
    roles?: string[];
  };
};

@Controller(['uploads', 'api/uploads'])
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...UPLOAD_ROLES)
export class UploadsController {
  constructor(
    private readonly objectStorage: ObjectStorageService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  @Post('single')
  @Roles(...UPLOAD_ROLES, ...EXAM_CELL_SELF_SERVICE_ROLES)
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async uploadSingle(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthRequest,
    @Body('purpose') purpose?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const hrOwnerId =
      purpose === HR_DOCUMENT_UPLOAD_PURPOSE ? req.user?.user_id : undefined;
    if (
      purpose === HR_DOCUMENT_UPLOAD_PURPOSE &&
      (!hrOwnerId || !req.user?.tenant_id)
    ) {
      throw new UnauthorizedException(
        'Authenticated employee and tenant required',
      );
    }
    return this.persistFile(file, req.user?.tenant_id ?? 'unknown', hrOwnerId);
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
  @Roles(...UPLOAD_ROLES, ...EXAM_CELL_ACCESS_ROLES)
  async downloadFile(
    @Query('path') filePath: string,
    @Query('key') objectKey: string,
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    // Class-level JwtAuthGuard applies (Bearer, access_token query, or auth cookie).
    if (!req.user) {
      throw new UnauthorizedException(
        'Authentication required to download files',
      );
    }

    // Stored S3 URLs identify private objects, never public bearer URLs. Keep
    // the configured bucket and normal tenant/document authorization in force.
    if (filePath?.startsWith('s3://') && this.objectStorage.isEnabled()) {
      let stored: URL;
      try {
        stored = new URL(filePath);
      } catch {
        throw new NotFoundException('File not found');
      }
      if (
        stored.hostname !== this.objectStorage.getBucketName() ||
        stored.username ||
        stored.password ||
        stored.search ||
        stored.hash
      )
        throw new NotFoundException('File not found');
      objectKey = stored.pathname.slice(1);
    }

    if (objectKey && this.objectStorage.isEnabled()) {
      const tenantId = req.user.tenant_id;
      // Object keys are tenant-prefixed by ObjectStorageService.buildKey
      if (tenantId && !objectKey.startsWith(`${tenantId}/`)) {
        throw new NotFoundException('File not found');
      }
      this.assertPrivateHrUploadAccess(objectKey, req.user);
      await this.assertTranscriptAccess(objectKey, req.user);
      res.setHeader('Cache-Control', 'private, no-store');
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

    if (
      !resolvedPath.startsWith(`${uploadRoot}${sep}`) ||
      !existsSync(resolvedPath)
    ) {
      throw new NotFoundException('File not found');
    }

    const tenantId = req.user.tenant_id;
    if (tenantId) {
      const tenantRoot = resolve(uploadRoot, tenantId);
      if (!resolvedPath.startsWith(`${tenantRoot}${sep}`)) {
        throw new NotFoundException('File not found');
      }
    }

    const relativeKey = relative(uploadRoot, resolvedPath).split(sep).join('/');
    if (isPrivateHrUploadKey(relativeKey)) {
      this.assertPrivateHrUploadAccess(relativeKey, req.user);
      // The uploader creates real files: a link must not substitute another employee's file.
      const canonicalKey = relative(
        realpathSync(uploadRoot),
        realpathSync(resolvedPath),
      )
        .split(sep)
        .join('/');
      if (canonicalKey !== relativeKey)
        throw new NotFoundException('File not found');
    }

    await this.assertTranscriptAccess(resolvedPath, req.user);
    res.setHeader('Cache-Control', 'private, no-store');

    res.setHeader(
      'Content-Disposition',
      `inline; filename="${basename(resolvedPath)}"`,
    );
    if (resolvedPath.endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
    }
    return createReadStream(resolvedPath).pipe(res);
  }

  private async assertTranscriptAccess(
    path: string,
    user: NonNullable<AuthRequest['user']>,
  ) {
    const transcriptFile = path.match(
      /\/transcripts\/([0-9a-f-]{36})(?:-[0-9a-f]{32})?\.pdf$/i,
    );
    if (!transcriptFile) {
      if (path.includes('/transcripts/'))
        throw new NotFoundException('File not found');
      return;
    }

    const transcriptId = transcriptFile[1];
    if (
      !user.tenant_id ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        transcriptId,
      )
    ) {
      throw new NotFoundException('File not found');
    }
    const rows = await this.db.query<
      Array<{
        transcript_id: string;
        tenant_id: string;
        student_user_id: string;
        semester: number;
        status: string;
        metadata: TranscriptRevisionMetadata;
        pdf_url: string;
        verification_code: string;
      }>
    >(
      `SELECT transcript_id, tenant_id, student_user_id, semester, status, metadata, pdf_url, verification_code FROM official_transcripts
       WHERE tenant_id = $1 AND transcript_id = $2 AND pdf_url IS NOT NULL`,
      [user.tenant_id, transcriptId],
    );
    const roles = [...(user.roles ?? []), user.role, user.primaryRole];
    const isExamStaff = roles.some((role) =>
      EXAM_CELL_ACCESS_ROLES.some(
        (staffRole) =>
          normalizeExamCellRole(role) === normalizeExamCellRole(staffRole),
      ),
    );
    if (
      !rows[0] ||
      (rows[0].student_user_id !== user.user_id && !isExamStaff)
    ) {
      throw new NotFoundException('File not found');
    }
    const record = rows[0];
    let expectedKey: string;
    if (!record.pdf_url) throw new NotFoundException('File not found');
    if (record.pdf_url.startsWith('/uploads/'))
      expectedKey = record.pdf_url.slice('/uploads/'.length);
    else if (record.pdf_url.startsWith('s3://'))
      expectedKey = new URL(record.pdf_url).pathname.slice(1);
    else throw new NotFoundException('File not found');
    const root = resolve(process.env.UPLOAD_PATH || './uploads');
    const actualKey = path.startsWith(`${root}${sep}`)
      ? relative(root, path).split(sep).join('/')
      : path.replace(/^\/uploads\//, '');
    if (
      actualKey !== expectedKey ||
      !(await isCurrentTranscript(this.db, record))
    )
      throw new NotFoundException('File not found');
  }

  private assertPrivateHrUploadAccess(
    key: string,
    user: NonNullable<AuthRequest['user']>,
  ) {
    if (!isPrivateHrUploadKey(key)) return;
    const ownerId = hrUploadOwner(key);
    // HR reviewers use the existing entity-scoped document ID endpoints.
    if (
      !user.tenant_id ||
      !key.startsWith(`${user.tenant_id}/`) ||
      !ownerId ||
      ownerId !== user.user_id
    ) {
      throw new NotFoundException('File not found');
    }
  }

  private async persistFile(
    file: Express.Multer.File,
    tenantId: string,
    hrOwnerId?: string,
  ) {
    const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
    const uploadName = hrOwnerId
      ? ownedHrUploadName(hrOwnerId, uniqueName)
      : uniqueName;
    if (!uploadName) throw new BadRequestException('Invalid upload owner');

    if (this.objectStorage.isEnabled()) {
      const key = this.objectStorage.buildKey(tenantId, uploadName);
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
    const relativePath = `${tenantId}/${year}/${month}/${uploadName}`;
    const targetDir = resolve(uploadPath, relativePath, '..');
    mkdirSync(targetDir, { recursive: true });
    const fullPath = resolve(uploadPath, relativePath);
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
