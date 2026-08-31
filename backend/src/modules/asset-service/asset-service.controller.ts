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
import type { AssetServiceActor } from './asset-service.types';
import { AssetServiceEvidenceService } from './asset-service-evidence.service';
import { AssetServiceService } from './asset-service.service';

@Controller('api/asset-service/v1')
@UseGuards(JwtAuthGuard)
export class AssetServiceController {
  constructor(
    private readonly service: AssetServiceService,
    private readonly evidence: AssetServiceEvidenceService,
  ) {}
  private rev(value?: string) {
    const n = Number(value?.replace(/^W\//, '').replace(/"/g, ''));
    if (!Number.isInteger(n) || n < 1)
      throw new BadRequestException('If-Match revision is required');
    return n;
  }
  @Get('dashboard') dashboard(@Req() req: { user: AssetServiceActor }) {
    return this.service.dashboard(req.user);
  }
  @Get('cases') cases(@Req() req: { user: AssetServiceActor }) {
    return this.service.queue(req.user);
  }
  @Get('providers') providers(@Req() req: { user: AssetServiceActor }) {
    return this.service.providers(req.user);
  }
  @Post('providers') provider(
    @Req() req: { user: AssetServiceActor },
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<AssetServiceService['createProvider']>[2],
  ) {
    return this.service.createProvider(req.user, key, body);
  }
  @Post('warranties') warranty(
    @Req() req: { user: AssetServiceActor },
    @Headers('idempotency-key') key: string,
    @Body()
    body: Parameters<AssetServiceService['createWarrantyEntitlement']>[2],
  ) {
    return this.service.createWarrantyEntitlement(req.user, key, body);
  }
  @Post('contracts') contract(
    @Req() req: { user: AssetServiceActor },
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<AssetServiceService['createServiceContract']>[2],
  ) {
    return this.service.createServiceContract(req.user, key, body);
  }
  @Post('preventive/policies') policy(
    @Req() req: { user: AssetServiceActor },
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<AssetServiceService['publishPreventivePolicy']>[2],
  ) {
    return this.service.publishPreventivePolicy(req.user, key, body);
  }
  @Post('preventive/schedules') schedule(
    @Req() req: { user: AssetServiceActor },
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<AssetServiceService['schedulePreventive']>[2],
  ) {
    return this.service.schedulePreventive(req.user, key, body);
  }
  @Get('cases/:id') detail(
    @Req() req: { user: AssetServiceActor },
    @Param('id') id: string,
  ) {
    return this.service.detail(req.user, id);
  }
  @Post('cases') create(
    @Req() req: { user: AssetServiceActor },
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<AssetServiceService['create']>[2],
  ) {
    return this.service.create(req.user, key, body);
  }
  @Post('cases/:id/submit') submit(
    @Req() req: { user: AssetServiceActor },
    @Param('id') id: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
  ) {
    return this.service.submit(req.user, id, this.rev(rev), key);
  }
  @Post('cases/:id/triage') triage(
    @Req() req: { user: AssetServiceActor },
    @Param('id') id: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<AssetServiceService['triage']>[4],
  ) {
    return this.service.triage(req.user, id, this.rev(rev), key, body);
  }
  @Post('cases/:id/coverage') coverage(
    @Req() req: { user: AssetServiceActor },
    @Param('id') id: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<AssetServiceService['decideCoverage']>[4],
  ) {
    return this.service.decideCoverage(req.user, id, this.rev(rev), key, body);
  }
  @Post('cases/:id/assign') assign(
    @Req() req: { user: AssetServiceActor },
    @Param('id') id: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<AssetServiceService['assign']>[4],
  ) {
    return this.service.assign(req.user, id, this.rev(rev), key, body);
  }
  @Post('cases/:id/start') start(
    @Req() req: { user: AssetServiceActor },
    @Param('id') id: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<AssetServiceService['start']>[4],
  ) {
    return this.service.start(req.user, id, this.rev(rev), key, body);
  }
  @Post('cases/:id/procurement-link') procurement(
    @Req() req: { user: AssetServiceActor },
    @Param('id') id: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
    @Body() body: { procurement_case_id: string },
  ) {
    return this.service.linkProcurement(
      req.user,
      id,
      this.rev(rev),
      key,
      body.procurement_case_id,
    );
  }
  @Post('cases/:id/acquisition-draft') acquisitionDraft(
    @Req() req: { user: AssetServiceActor },
    @Param('id') id: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<AssetServiceService['createAcquisitionDraft']>[4],
  ) {
    return this.service.createAcquisitionDraft(
      req.user,
      id,
      this.rev(rev),
      key,
      body,
    );
  }
  @Post('cases/:id/diagnoses') diagnose(
    @Req() req: { user: AssetServiceActor },
    @Param('id') id: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<AssetServiceService['diagnose']>[4],
  ) {
    return this.service.diagnose(req.user, id, this.rev(rev), key, body);
  }
  @Post('cases/:id/estimates') estimate(
    @Req() req: { user: AssetServiceActor },
    @Param('id') id: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<AssetServiceService['estimate']>[4],
  ) {
    return this.service.estimate(req.user, id, this.rev(rev), key, body);
  }
  @Post('cases/:id/estimates/:estimateId/approve') approveEstimate(
    @Req() req: { user: AssetServiceActor },
    @Param('id') id: string,
    @Param('estimateId') estimateId: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.approveEstimate(
      req.user,
      id,
      estimateId,
      this.rev(rev),
      key,
      body,
    );
  }
  @Post('cases/:id/tasks') task(
    @Req() req: { user: AssetServiceActor },
    @Param('id') id: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<AssetServiceService['addTask']>[4],
  ) {
    return this.service.addTask(req.user, id, this.rev(rev), key, body);
  }
  @Post('cases/:id/tasks/:taskId/complete') completeTask(
    @Req() req: { user: AssetServiceActor },
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.completeTask(
      req.user,
      id,
      taskId,
      this.rev(rev),
      key,
      body,
    );
  }
  @Post('cases/:id/parts') part(
    @Req() req: { user: AssetServiceActor },
    @Param('id') id: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<AssetServiceService['addPart']>[4],
  ) {
    return this.service.addPart(req.user, id, this.rev(rev), key, body);
  }
  @Post('cases/:id/parts/:partId/reconcile') reconcile(
    @Req() req: { user: AssetServiceActor },
    @Param('id') id: string,
    @Param('partId') partId: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<AssetServiceService['reconcilePart']>[5],
  ) {
    return this.service.reconcilePart(
      req.user,
      id,
      partId,
      this.rev(rev),
      key,
      body,
    );
  }
  @Post('cases/:id/complete-work') completeWork(
    @Req() req: { user: AssetServiceActor },
    @Param('id') id: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<AssetServiceService['completeWork']>[4],
  ) {
    return this.service.completeWork(req.user, id, this.rev(rev), key, body);
  }
  @Post('cases/:id/cancel') cancel(
    @Req() req: { user: AssetServiceActor },
    @Param('id') id: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
    @Body() body: { reason: string },
  ) {
    return this.service.cancel(req.user, id, this.rev(rev), key, body.reason);
  }
  @Post('cases/:id/vendor-return') vendorReturn(
    @Req() req: { user: AssetServiceActor },
    @Param('id') id: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<AssetServiceService['vendorReturn']>[4],
  ) {
    return this.service.vendorReturn(req.user, id, this.rev(rev), key, body);
  }
  @Post('cases/:id/reverification')
  reverification(
    @Req() req: { user: AssetServiceActor },
    @Param('id') id: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<AssetServiceService['recordReverification']>[4],
  ) {
    return this.service.recordReverification(
      req.user,
      id,
      this.rev(rev),
      key,
      body,
    );
  }
  @Post('cases/:id/accept') accept(
    @Req() req: { user: AssetServiceActor },
    @Param('id') id: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<AssetServiceService['accept']>[4],
  ) {
    return this.service.accept(req.user, id, this.rev(rev), key, body);
  }
  @Post('cases/:id/supersede') supersede(
    @Req() req: { user: AssetServiceActor },
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Body() body: { reason: string },
  ) {
    return this.service.supersede(req.user, id, key, body.reason);
  }
  @Post('cases/:id/evidence')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 100 * 1024 * 1024, files: 1 },
    }),
  )
  upload(
    @Req() req: { user: AssetServiceActor },
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Body() body: { evidence_type: string; retention_class?: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.evidence.upload(
      req.user,
      id,
      key,
      body.evidence_type,
      body.retention_class,
      file,
    );
  }
}
