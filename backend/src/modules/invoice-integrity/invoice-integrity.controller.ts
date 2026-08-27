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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type {
  HumanDecisionInput,
  IntegrityActor,
  MarketObservationInput,
  SourceSnapshotInput,
} from './invoice-integrity.types';
import { InvoiceIntegrityService } from './invoice-integrity.service';
import { InvoiceIntegrityEvidenceService } from './invoice-integrity-evidence.service';

const evidenceInterceptor = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    const valid = ['application/pdf', 'image/png', 'image/jpeg'].includes(
      file.mimetype,
    );
    callback(
      valid
        ? null
        : new BadRequestException('Evidence must be a PDF, PNG, or JPEG'),
      valid,
    );
  },
});

@Controller('api/invoice-integrity/v1')
@UseGuards(JwtAuthGuard)
export class InvoiceIntegrityController {
  constructor(
    private readonly integrity: InvoiceIntegrityService,
    private readonly evidence: InvoiceIntegrityEvidenceService,
  ) {}

  private revision(value?: string) {
    const revision = Number(value?.replace(/^W\//, '').replace(/"/g, ''));
    if (!Number.isInteger(revision) || revision <= 0)
      throw new BadRequestException('If-Match revision is required');
    return revision;
  }

  @Get('dashboard')
  dashboard(@Req() req: { user: IntegrityActor }) {
    return this.integrity.dashboard(req.user);
  }

  @Get('cases')
  list(@Req() req: { user: IntegrityActor }, @Query('state') state?: string) {
    return this.integrity.list(req.user, state);
  }

  @Get('cases/:caseId')
  get(@Req() req: { user: IntegrityActor }, @Param('caseId') caseId: string) {
    return this.integrity.get(req.user, caseId);
  }

  @Post('cases/:caseId/step-up/request')
  requestStepUp(
    @Req() req: { user: IntegrityActor },
    @Param('caseId') caseId: string,
    @Body() body: { purpose: 'ATTENDED_RETRIEVAL' | 'CERTIFICATION' },
  ) {
    return this.integrity.requestStepUp(req.user, caseId, body.purpose);
  }

  @Post('cases/:caseId/step-up/:challengeId/verify')
  verifyStepUp(
    @Req() req: { user: IntegrityActor },
    @Param('caseId') caseId: string,
    @Param('challengeId') challengeId: string,
    @Body() body: { otp: string },
  ) {
    return this.integrity.verifyStepUp(req.user, caseId, challengeId, body.otp);
  }

  @Get('source-accounts')
  sourceAccounts(@Req() req: { user: IntegrityActor }) {
    return this.integrity.listSourceAccounts(req.user);
  }

  @Post('source-accounts')
  createSourceAccount(
    @Req() req: { user: IntegrityActor },
    @Body()
    body: {
      department_id?: number;
      platform: string;
      account_label: string;
      external_account_reference: string;
      secret_reference?: string;
      allowed_domains: string[];
      allowed_methods?: string[];
    },
  ) {
    return this.integrity.createSourceAccount(req.user, body);
  }

  @Post('cases/:caseId/retrievals')
  retrieval(
    @Req() req: { user: IntegrityActor },
    @Param('caseId') caseId: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body()
    body: {
      source_account_id: string;
      retrieval_method: string;
      target_order_id: string;
    },
  ) {
    return this.integrity.initiateRetrieval(
      req.user,
      caseId,
      this.revision(revision),
      body,
      key,
    );
  }

  @Post('cases/:caseId/source-snapshots')
  sourceSnapshot(
    @Req() req: { user: IntegrityActor },
    @Param('caseId') caseId: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body() body: SourceSnapshotInput,
  ) {
    return this.integrity.recordSourceSnapshot(
      req.user,
      caseId,
      this.revision(revision),
      body,
      key,
    );
  }

  @Post('cases/:caseId/attended-sessions/:sessionId/complete')
  completeAttendedSession(
    @Req() req: { user: IntegrityActor },
    @Param('caseId') caseId: string,
    @Param('sessionId') sessionId: string,
    @Headers('if-match') revision: string,
    @Body()
    body: {
      status: 'COMPLETED' | 'FAILED' | 'CANCELLED';
      result?: Record<string, unknown>;
      evidence_ids?: string[];
    },
  ) {
    return this.integrity.completeAttendedSession(
      req.user,
      caseId,
      sessionId,
      this.revision(revision),
      body,
    );
  }

  @Post('cases/:caseId/market-observations')
  marketObservation(
    @Req() req: { user: IntegrityActor },
    @Param('caseId') caseId: string,
    @Headers('if-match') revision: string,
    @Body() body: MarketObservationInput,
  ) {
    return this.integrity.addMarketObservation(
      req.user,
      caseId,
      this.revision(revision),
      body,
    );
  }

  @Post('cases/:caseId/evidence')
  @UseInterceptors(evidenceInterceptor)
  uploadEvidence(
    @Req() req: { user: IntegrityActor },
    @Param('caseId') caseId: string,
    @Query('type') evidenceType: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.evidence.upload(req.user, caseId, evidenceType, file);
  }

  @Get('cases/:caseId/evidence/:evidenceId/download')
  async downloadEvidence(
    @Req() req: { user: IntegrityActor },
    @Param('caseId') caseId: string,
    @Param('evidenceId') evidenceId: string,
    @Res() response: Response,
  ) {
    const document = await this.evidence.download(req.user, caseId, evidenceId);
    response.setHeader('Content-Type', document.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${document.filename.replace(/["\\\r\n]/g, '_')}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    document.stream.pipe(response);
  }

  @Post('cases/:caseId/analyze')
  analyze(
    @Req() req: { user: IntegrityActor },
    @Param('caseId') caseId: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body()
    body: {
      parser_version?: string;
      extracted_fields?: Record<string, unknown>;
      field_confidence?: Record<string, number>;
      forensic_signals?: Array<Record<string, unknown>>;
    },
  ) {
    return this.integrity.analyze(
      req.user,
      caseId,
      this.revision(revision),
      body,
      key,
    );
  }

  @Post('cases/:caseId/evidence-requests')
  requestEvidence(
    @Req() req: { user: IntegrityActor },
    @Param('caseId') caseId: string,
    @Headers('if-match') revision: string,
    @Body()
    body: {
      requested_from: string;
      public_reason: string;
      requested_evidence_types: string[];
      due_at?: string;
    },
  ) {
    return this.integrity.requestEvidence(
      req.user,
      caseId,
      this.revision(revision),
      body,
    );
  }

  @Post('cases/:caseId/evidence-requests/:requestId/respond')
  respondEvidence(
    @Req() req: { user: IntegrityActor },
    @Param('caseId') caseId: string,
    @Param('requestId') requestId: string,
    @Headers('if-match') revision: string,
    @Body() body: { response_text: string },
  ) {
    return this.integrity.respondEvidence(
      req.user,
      caseId,
      requestId,
      this.revision(revision),
      body.response_text,
    );
  }

  @Post('cases/:caseId/investigations')
  investigate(
    @Req() req: { user: IntegrityActor },
    @Param('caseId') caseId: string,
    @Headers('if-match') revision: string,
    @Body() body: { restricted_notes?: string },
  ) {
    return this.integrity.openInvestigation(
      req.user,
      caseId,
      this.revision(revision),
      body.restricted_notes,
    );
  }

  @Post('cases/:caseId/investigations/:investigationId/recommend')
  recommend(
    @Req() req: { user: IntegrityActor },
    @Param('caseId') caseId: string,
    @Param('investigationId') investigationId: string,
    @Headers('if-match') revision: string,
    @Body()
    body: {
      recommendation: 'CLEAR' | 'REJECT' | 'REQUEST_MORE_EVIDENCE';
      reason: string;
    },
  ) {
    return this.integrity.recommend(
      req.user,
      caseId,
      investigationId,
      this.revision(revision),
      body,
    );
  }

  @Post('cases/:caseId/certifications')
  certify(
    @Req() req: { user: IntegrityActor },
    @Param('caseId') caseId: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body() body: HumanDecisionInput,
  ) {
    return this.integrity.certifyHuman(
      req.user,
      caseId,
      this.revision(revision),
      body,
      key,
    );
  }

  @Get('cases/:caseId/policies')
  policies(
    @Req() req: { user: IntegrityActor },
    @Param('caseId') caseId: string,
  ) {
    return this.integrity.listPolicies(req.user, caseId);
  }
}
