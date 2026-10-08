import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AssetRetirementActor } from './asset-retirement.types';
import { AssetRetirementEvidenceService } from './asset-retirement-evidence.service';
import { AssetRetirementService } from './asset-retirement.service';

@Controller('api/asset-retirement/v1')
@UseGuards(JwtAuthGuard)
export class AssetRetirementController {
  constructor(
    private readonly service: AssetRetirementService,
    private readonly evidence: AssetRetirementEvidenceService,
  ) {}
  private rev(value?: string) {
    const revision = Number(value?.replace(/^W\//, '').replace(/"/g, ''));
    if (!Number.isInteger(revision) || revision < 1)
      throw new BadRequestException('If-Match revision is required');
    return revision;
  }
  @Get('dashboard') dashboard(@Req() req: { user: AssetRetirementActor }) {
    return this.service.dashboard(req.user);
  }
  @Get('cases') cases(@Req() req: { user: AssetRetirementActor }) {
    return this.service.queue(req.user);
  }
  @Get('eligible-assets') assets(@Req() req: { user: AssetRetirementActor }) {
    return this.service.eligibleAssets(req.user);
  }
  @Get('providers') providers(@Req() req: { user: AssetRetirementActor }) {
    return this.service.providers(req.user);
  }
  @Post('providers') provider(
    @Req() req: { user: AssetRetirementActor },
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<AssetRetirementService['createProvider']>[2],
  ) {
    return this.service.createProvider(req.user, key, body);
  }
  @Post('parties') party(
    @Req() req: { user: AssetRetirementActor },
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<AssetRetirementService['createParty']>[2],
  ) {
    return this.service.createParty(req.user, key, body);
  }
  @Post('policies') policy(
    @Req() req: { user: AssetRetirementActor },
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<AssetRetirementService['publishPolicy']>[2],
  ) {
    return this.service.publishPolicy(req.user, key, body);
  }
  @Get('cases/:id') detail(
    @Req() req: { user: AssetRetirementActor },
    @Param('id') id: string,
  ) {
    return this.service.detail(req.user, id);
  }
  @Post('cases') create(
    @Req() req: { user: AssetRetirementActor },
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<AssetRetirementService['create']>[2],
  ) {
    return this.service.create(req.user, key, body);
  }
  @Post('cases/:id/submit') submit(
    @Req() req: { user: AssetRetirementActor },
    @Param('id') id: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
  ) {
    return this.service.submit(req.user, id, this.rev(revision), key);
  }
  @Post('cases/:id/assessments') assess(
    @Req() req: { user: AssetRetirementActor },
    @Param('id') id: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<AssetRetirementService['assess']>[4],
  ) {
    return this.service.assess(req.user, id, this.rev(revision), key, body);
  }
  @Post('cases/:id/financial-snapshots') financialSnapshot(
    @Req() req: { user: AssetRetirementActor },
    @Param('id') id: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body()
    body: Parameters<AssetRetirementService['captureFinancialSnapshot']>[4],
  ) {
    return this.service.captureFinancialSnapshot(
      req.user,
      id,
      this.rev(revision),
      key,
      body,
    );
  }
  @Post('cases/:id/dofa-submit') dofa(
    @Req() req: { user: AssetRetirementActor },
    @Param('id') id: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
  ) {
    return this.service.submitDofa(req.user, id, this.rev(revision), key);
  }
  @Post('cases/:id/sanitization') sanitization(
    @Req() req: { user: AssetRetirementActor },
    @Param('id') id: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body()
    body: Parameters<AssetRetirementService['createSanitizationJob']>[4],
  ) {
    return this.service.createSanitizationJob(
      req.user,
      id,
      this.rev(revision),
      key,
      body,
    );
  }
  @Post('cases/:id/sanitization/:jobId/verify') verifySanitization(
    @Req() req: { user: AssetRetirementActor },
    @Param('id') id: string,
    @Param('jobId') jobId: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body()
    body: Parameters<AssetRetirementService['verifySanitization']>[5],
  ) {
    return this.service.verifySanitization(
      req.user,
      id,
      jobId,
      this.rev(revision),
      key,
      body,
    );
  }
  @Post('cases/:id/disposal-lots') lot(
    @Req() req: { user: AssetRetirementActor },
    @Param('id') id: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body()
    body: Parameters<AssetRetirementService['createDisposalLot']>[4],
  ) {
    return this.service.createDisposalLot(
      req.user,
      id,
      this.rev(revision),
      key,
      body,
    );
  }
  @Post('cases/:id/disposal-lots/:lotId/lock') lockLot(
    @Req() req: { user: AssetRetirementActor },
    @Param('id') id: string,
    @Param('lotId') lotId: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
  ) {
    return this.service.lockDisposalLot(
      req.user,
      id,
      lotId,
      this.rev(revision),
      key,
    );
  }
  @Post('cases/:id/disposal-lots/:lotId/offers') offer(
    @Req() req: { user: AssetRetirementActor },
    @Param('id') id: string,
    @Param('lotId') lotId: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<AssetRetirementService['submitOffer']>[4],
  ) {
    return this.service.submitOffer(req.user, id, lotId, key, body);
  }
  @Post('cases/:id/disposal-lots/:lotId/open-offers') openOffers(
    @Req() req: { user: AssetRetirementActor },
    @Param('id') id: string,
    @Param('lotId') lotId: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<AssetRetirementService['openOffers']>[5],
  ) {
    return this.service.openOffers(
      req.user,
      id,
      lotId,
      this.rev(revision),
      key,
      body,
    );
  }
  @Post('cases/:id/disposal-lots/:lotId/award') award(
    @Req() req: { user: AssetRetirementActor },
    @Param('id') id: string,
    @Param('lotId') lotId: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<AssetRetirementService['award']>[5],
  ) {
    return this.service.award(
      req.user,
      id,
      lotId,
      this.rev(revision),
      key,
      body,
    );
  }
  @Post('cases/:id/physical-completion') physical(
    @Req() req: { user: AssetRetirementActor },
    @Param('id') id: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body()
    body: Parameters<AssetRetirementService['recordPhysicalCompletion']>[4],
  ) {
    return this.service.recordPhysicalCompletion(
      req.user,
      id,
      this.rev(revision),
      key,
      body,
    );
  }
  @Post('cases/:id/finance/request') financeRequest(
    @Req() req: { user: AssetRetirementActor },
    @Param('id') id: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
  ) {
    return this.service.requestFinancePosting(
      req.user,
      id,
      this.rev(revision),
      key,
    );
  }
  @Post('cases/:id/finance/projections') finance(
    @Req() req: { user: AssetRetirementActor },
    @Param('id') id: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body()
    body: Parameters<AssetRetirementService['recordFinanceProjection']>[4],
  ) {
    return this.service.recordFinanceProjection(
      req.user,
      id,
      this.rev(revision),
      key,
      body,
    );
  }
  @Post('cases/:id/certificates') certificate(
    @Req() req: { user: AssetRetirementActor },
    @Param('id') id: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
  ) {
    return this.service.issueCertificate(req.user, id, this.rev(revision), key);
  }
  @Post('cases/:id/cancel') cancel(
    @Req() req: { user: AssetRetirementActor },
    @Param('id') id: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body() body: { reason: string },
  ) {
    return this.service.cancel(
      req.user,
      id,
      this.rev(revision),
      key,
      body.reason,
    );
  }
  @Post('cases/:id/supersede') supersede(
    @Req() req: { user: AssetRetirementActor },
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Body() body: { reason: string },
  ) {
    return this.service.supersede(req.user, id, key, body.reason);
  }
  @Post('cases/:id/evidence')
  @UseInterceptors(FileInterceptor('file'))
  evidenceUpload(
    @Req() req: { user: AssetRetirementActor },
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Body('evidence_type') evidenceType: string,
    @Body('retention_class') retentionClass: string | undefined,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.evidence.upload(
      req.user,
      id,
      key,
      evidenceType,
      retentionClass,
      file,
    );
  }
}

@Controller('api/asset-retirement/v1/public')
export class AssetRetirementPublicController {
  constructor(private readonly service: AssetRetirementService) {}
  @Get('certificates/:code') certificate(@Param('code') code: string) {
    return this.service.publicCertificate(code);
  }
}
