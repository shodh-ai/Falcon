import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
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
import { Public } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type {
  AnalyzeSubjectInput,
  CreateLotInput,
  InvoiceAllocationInput,
  PolicyAttribute,
  ProductVerificationActor,
} from './product-verification.types';
import { ProductVerificationEvidenceService } from './product-verification-evidence.service';
import { ProductVerificationService } from './product-verification.service';

const mediaInterceptor = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
});

@Controller('api/product-verification/v1')
@UseGuards(JwtAuthGuard)
export class ProductVerificationController {
  constructor(
    private readonly verification: ProductVerificationService,
    private readonly evidence: ProductVerificationEvidenceService,
  ) {}

  private revision(value?: string) {
    const revision = Number(value?.replace(/^W\//, '').replace(/"/g, ''));
    if (!Number.isInteger(revision) || revision <= 0)
      throw new BadRequestException('If-Match revision is required');
    return revision;
  }

  @Get('dashboard')
  dashboard(@Req() request: { user: ProductVerificationActor }) {
    return this.verification.dashboard(request.user);
  }

  @Get('cases')
  list(
    @Req() request: { user: ProductVerificationActor },
    @Query('state') state?: string,
  ) {
    return this.verification.list(request.user, state);
  }

  @Get('cases/:caseId')
  get(
    @Req() request: { user: ProductVerificationActor },
    @Param('caseId') caseId: string,
  ) {
    return this.verification.get(request.user, caseId);
  }

  @Post('policies/geofences/publish')
  publishGeofence(
    @Req() request: { user: ProductVerificationActor },
    @Body()
    body: {
      campus_reference?: string;
      geometry_type: 'CIRCLE' | 'POLYGON';
      geometry: Record<string, unknown>;
      maximum_accuracy_metres?: number;
    },
  ) {
    return this.verification.publishGeofence(request.user, body);
  }

  @Post('policies/verification/publish')
  publishVerificationPolicy(
    @Req() request: { user: ProductVerificationActor },
    @Body()
    body: {
      category?: string;
      subject_type: 'ITEM' | 'LOT';
      attributes: PolicyAttribute[];
      required_views: string[];
      automated_min_coverage?: number;
      automated_min_confidence?: number;
      maximum_media_count?: number;
      session_validity_seconds?: number;
      exception_types?: string[];
    },
  ) {
    return this.verification.publishVerificationPolicy(request.user, body);
  }

  @Post('cases/:caseId/lots')
  createLot(
    @Req() request: { user: ProductVerificationActor },
    @Param('caseId') caseId: string,
    @Headers('if-match') revision: string,
    @Body() body: CreateLotInput,
  ) {
    return this.verification.createLot(
      request.user,
      caseId,
      this.revision(revision),
      body,
    );
  }

  @Post('cases/:caseId/subjects/:subjectId/invoice-allocations')
  allocateInvoice(
    @Req() request: { user: ProductVerificationActor },
    @Param('caseId') caseId: string,
    @Param('subjectId') subjectId: string,
    @Headers('if-match') revision: string,
    @Body() body: InvoiceAllocationInput,
  ) {
    return this.verification.allocateInvoice(
      request.user,
      caseId,
      subjectId,
      this.revision(revision),
      body,
    );
  }

  @Post('cases/:caseId/subjects/:subjectId/capture-exceptions')
  captureException(
    @Req() request: { user: ProductVerificationActor },
    @Param('caseId') caseId: string,
    @Param('subjectId') subjectId: string,
    @Headers('if-match') revision: string,
    @Body()
    body: { exception_type: string; reason: string; validity_minutes?: number },
  ) {
    return this.verification.createCaptureException(
      request.user,
      caseId,
      subjectId,
      this.revision(revision),
      body,
    );
  }

  @Post('cases/:caseId/subjects/:subjectId/capture-sessions')
  captureSession(
    @Req() request: { user: ProductVerificationActor },
    @Param('caseId') caseId: string,
    @Param('subjectId') subjectId: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body() body: { capture_exception_id?: string; campus_reference?: string },
  ) {
    return this.verification.createCaptureSession(
      request.user,
      caseId,
      subjectId,
      this.revision(revision),
      key,
      body,
    );
  }

  @Post('cases/:caseId/capture-sessions/:sessionId/evidence')
  @UseInterceptors(mediaInterceptor)
  uploadEvidence(
    @Req() request: { user: ProductVerificationActor },
    @Param('caseId') caseId: string,
    @Param('sessionId') sessionId: string,
    @Headers('x-capture-nonce') nonce: string,
    @Headers('x-session-fingerprint') fingerprint: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Query('view') viewType: string,
    @Body() body: Record<string, string>,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (
      !nonce?.trim() ||
      !fingerprint?.trim() ||
      !idempotencyKey?.trim() ||
      !viewType?.trim()
    )
      throw new BadRequestException(
        'Capture nonce, fingerprint, and view are required',
      );
    let device: Record<string, unknown> = {};
    try {
      const parsed: unknown = body.device_metadata
        ? JSON.parse(body.device_metadata)
        : {};
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')
        throw new Error('Invalid object');
      device = parsed as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Device metadata must be valid JSON');
    }
    return this.evidence.upload(
      request.user,
      caseId,
      sessionId,
      idempotencyKey,
      viewType,
      nonce,
      fingerprint,
      {
        latitude:
          body.latitude === undefined ? undefined : Number(body.latitude),
        longitude:
          body.longitude === undefined ? undefined : Number(body.longitude),
        accuracy_metres:
          body.accuracy_metres === undefined
            ? undefined
            : Number(body.accuracy_metres),
      },
      body.client_captured_at,
      device,
      file,
    );
  }

  @Post('cases/:caseId/capture-sessions/:sessionId/complete')
  completeCapture(
    @Req() request: { user: ProductVerificationActor },
    @Param('caseId') caseId: string,
    @Param('sessionId') sessionId: string,
    @Headers('if-match') revision: string,
    @Body() body: { nonce: string },
  ) {
    return this.verification.completeCaptureSession(
      request.user,
      caseId,
      sessionId,
      this.revision(revision),
      body.nonce,
    );
  }

  @Get('cases/:caseId/evidence/:evidenceId/download')
  async download(
    @Req() request: { user: ProductVerificationActor },
    @Param('caseId') caseId: string,
    @Param('evidenceId') evidenceId: string,
    @Res() response: Response,
  ) {
    const document = await this.evidence.download(
      request.user,
      caseId,
      evidenceId,
    );
    response.setHeader('Content-Type', document.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${document.filename.replace(/["\\\r\n]/g, '_')}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    document.stream.pipe(response);
  }

  @Post('cases/:caseId/subjects/:subjectId/analyze')
  analyze(
    @Req() request: { user: ProductVerificationActor },
    @Param('caseId') caseId: string,
    @Param('subjectId') subjectId: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body() body: AnalyzeSubjectInput,
  ) {
    return this.verification.analyze(
      request.user,
      caseId,
      subjectId,
      this.revision(revision),
      body,
      key,
    );
  }

  @Post('cases/:caseId/subjects/:subjectId/review')
  review(
    @Req() request: { user: ProductVerificationActor },
    @Param('caseId') caseId: string,
    @Param('subjectId') subjectId: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body()
    body: {
      recommendation:
        | 'CLEAR'
        | 'REJECT'
        | 'REQUEST_EVIDENCE'
        | 'REQUEST_EXCEPTION';
      reason: string;
      exception_type?: string;
    },
  ) {
    return this.verification.review(
      request.user,
      caseId,
      subjectId,
      this.revision(revision),
      body,
      key,
    );
  }

  @Post('cases/:caseId/exceptions/:recommendationId/approve')
  approveException(
    @Req() request: { user: ProductVerificationActor },
    @Param('caseId') caseId: string,
    @Param('recommendationId') recommendationId: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body() body: { reason: string },
  ) {
    return this.verification.approveException(
      request.user,
      caseId,
      recommendationId,
      this.revision(revision),
      body.reason,
      key,
    );
  }

  @Post('cases/:caseId/subjects/:subjectId/reconsider')
  reconsider(
    @Req() request: { user: ProductVerificationActor },
    @Param('caseId') caseId: string,
    @Param('subjectId') subjectId: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body() body: { reason: string },
  ) {
    return this.verification.reconsider(
      request.user,
      caseId,
      subjectId,
      this.revision(revision),
      body.reason,
      key,
    );
  }

  @Post('cases/:caseId/subjects/:subjectId/inventory-projections')
  inventoryProjection(
    @Req() request: { user: ProductVerificationActor },
    @Param('caseId') caseId: string,
    @Param('subjectId') subjectId: string,
    @Body()
    body: {
      source_event_id: string;
      aggregate_sequence: number;
      occurred_at: string;
      verification_identity_id: string;
      rfid?: string;
      university_serial?: string;
      asset_id?: string;
      inventory_record_id?: string;
      payload?: Record<string, unknown>;
    },
  ) {
    return this.verification.recordInventoryProjection(
      request.user,
      caseId,
      subjectId,
      body,
    );
  }

  @Public()
  @Get('verify/:code')
  verifyCode(@Param('code') code: string) {
    return this.verification.verifyCode(code);
  }
}
