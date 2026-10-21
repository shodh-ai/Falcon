import {
  BadRequestException, Body, Controller, Get, Param, Patch, Post, Query,
  Req, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { BelongsToModule } from '../../module-control/module-control.decorators';
import { ObjectStorageService } from '../../storage/object-storage.service';
import { StaffProfileReviewService } from './staff-profile-review.service';
import { StudentOnboardingService } from './student-onboarding.service';
import { requirePersistentUploadRoot } from './persistent-upload-root.util';

type ReviewActor = {
  user_id: string;
  tenant_id: string;
  role?: string;
  roles?: string[];
  dept_id?: number | null;
};

@Controller('api/staff/profile-review')
@BelongsToModule('CORE')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Faculty', 'HOD', 'Dean')
export class StaffProfileReviewSelfController {
  constructor(
    private readonly reviews: StaffProfileReviewService,
    private readonly storage: ObjectStorageService,
  ) {}

  @Get('me')
  me(@Req() req: { user: ReviewActor }) {
    return this.reviews.me(req.user.tenant_id, req.user.user_id);
  }

  @Patch('me/corrections')
  correct(@Req() req: { user: ReviewActor }, @Body() changes: Record<string, unknown>) {
    return this.reviews.correctProfile(req.user.tenant_id, req.user.user_id, changes);
  }

  @Post('me/documents/:docType')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 },
  }))
  async document(
    @Req() req: { user: ReviewActor }, @Param('docType') docType: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const extensions: Record<string, string> = {
      'application/pdf': '.pdf', 'image/png': '.png',
      'image/jpeg': '.jpg', 'image/webp': '.webp',
    };
    if (!extensions[file.mimetype]) {
      throw new BadRequestException('Only PDF, PNG, JPEG and WebP documents are accepted');
    }
    await this.reviews.assertDocumentCorrectionAllowed(
      req.user.tenant_id, req.user.user_id, docType.toUpperCase(),
    );
    const fileName = `${uuidv4()}${extensions[file.mimetype]}`;
    let filePath: string;
    if (this.storage.isEnabled()) {
      const key = this.storage.buildKey(req.user.tenant_id, fileName);
      const stored = await this.storage.upload(
        req.user.tenant_id, key, file.buffer, file.mimetype,
      );
      filePath = stored.url ?? stored.key;
    } else {
      const now = new Date();
      const root = await requirePersistentUploadRoot();
      const directory = `${root}/${req.user.tenant_id}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
      if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
      filePath = `${directory}/${fileName}`;
      await new Promise<void>((resolve, reject) => {
        const stream = createWriteStream(filePath, { flags: 'wx', mode: 0o640 });
        stream.on('finish', resolve);
        stream.on('error', reject);
        stream.end(file.buffer);
      });
    }
    return this.reviews.correctDocument(
      req.user.tenant_id, req.user.user_id, docType.toUpperCase(),
      filePath,
    );
  }

  @Post('me/resubmit')
  resubmit(@Req() req: { user: ReviewActor }) {
    return this.reviews.resubmit(req.user.tenant_id, req.user.user_id);
  }
}

@Controller('api/hr/staff-profile-reviews')
// Staff identity verification is a core onboarding control. It must remain
// available even when the wider HRMS business suite is not launched.
@BelongsToModule('CORE')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('HR', 'HRAdmin', 'CampusAdmin', 'SuperAdmin')
export class StaffProfileReviewAdminController {
  constructor(
    private readonly reviews: StaffProfileReviewService,
    private readonly onboarding: StudentOnboardingService,
  ) {}

  @Get('pharmacy/departments')
  @Roles('HRAdmin')
  pharmacyDepartments(@Req() req: { user: ReviewActor }) {
    return this.reviews.pharmacyDepartments(req.user.tenant_id);
  }

  @Post('sync-submitted')
  @Roles('HRAdmin')
  syncSubmitted(@Req() req: { user: ReviewActor }) {
    return this.reviews.importSubmittedStaff(req.user.tenant_id, req.user.user_id);
  }

  @Get('pharmacy/preview')
  @Roles('HRAdmin')
  preview(@Req() req: { user: ReviewActor }, @Query('department_id') departmentId: string) {
    const id = Number(departmentId);
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('Exact department_id is required');
    return this.reviews.pharmacyPreview(req.user.tenant_id, id);
  }

  @Post('pharmacy/reopen')
  @Roles('HRAdmin')
  reopen(
    @Req() req: { user: ReviewActor; headers: Record<string, string | undefined> },
    @Body() body: { department_id: number; preview_hash: string; backup_reference: string },
  ) {
    const id = Number(body.department_id);
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('Exact department_id is required');
    return this.reviews.reopenPharmacy(
      req.user.tenant_id, id, body.preview_hash, body.backup_reference,
      req.headers['idempotency-key'] ?? '', req.user.user_id,
    );
  }

  @Get()
  queue(
    @Req() req: { user: ReviewActor }, @Query('department_id') departmentId?: string,
  ) {
    const parsed = departmentId == null ? undefined : Number(departmentId);
    if (departmentId != null && (!Number.isInteger(parsed) || parsed! <= 0)) {
      throw new BadRequestException('department_id must be a positive integer');
    }
    return this.reviews.queue(req.user.tenant_id, parsed, req.user);
  }

  @Get(':reviewId')
  detail(@Req() req: { user: ReviewActor }, @Param('reviewId') reviewId: string) {
    return this.reviews.detail(req.user.tenant_id, reviewId, req.user);
  }

  @Post(':reviewId/return')
  @Roles('HRAdmin')
  async returnForCorrection(
    @Req() req: { user: ReviewActor }, @Param('reviewId') reviewId: string,
    @Body() body: { reason?: string; fields?: string[]; documents?: string[] },
  ) {
    // Match the same campus/object-scope check used by the approval path.
    await this.reviews.detail(req.user.tenant_id, reviewId, req.user);
    return this.reviews.returnForCorrection(req.user.tenant_id, reviewId, req.user.user_id, body);
  }

  @Post(':reviewId/approve')
  @Roles('HRAdmin')
  async approve(@Req() req: { user: ReviewActor }, @Param('reviewId') reviewId: string,
    @Body() body?: { defer_documents?: boolean; reviewed_fields?: string[]; deferral_reason?: string; reviewed_documents?: string[]; revision?: number },
  ) {
    if (body?.defer_documents !== undefined && typeof body.defer_documents !== 'boolean') {
      throw new BadRequestException('defer_documents must be a boolean');
    }
    const detail = await this.reviews.detail(req.user.tenant_id, reviewId, req.user);
    return this.onboarding.approve(
      req.user.tenant_id, detail.review.user_id,
      { userId: req.user.user_id, role: req.user.role }, req.user, 'staff', reviewId,
      body?.defer_documents ? { reviewedFields: body.reviewed_fields ?? [], reason: body.deferral_reason ?? '' } : undefined,
      detail.review.recovery_required ? { reviewedFields: body?.reviewed_fields ?? [], reviewedDocuments: body?.reviewed_documents ?? [], revision: body?.revision ?? -1 } : undefined,
    );
  }

  @Post(':reviewId/verify-documents')
  @Roles('HRAdmin')
  verifyDocuments(@Req() req: { user: ReviewActor }, @Param('reviewId') reviewId: string,
    @Body() body: { reviewed_documents?: string[] },
  ) {
    return this.reviews.verifyDocuments(req.user.tenant_id, reviewId, req.user, body?.reviewed_documents);
  }
}
