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
import type { InventoryActor } from '../inventory/inventory.types';
import { ReturnsEvidenceService } from './returns-evidence.service';
import { ReturnsService } from './returns.service';

const evidenceInterceptor = FileInterceptor('file', {
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
});
@Controller('api/returns/v1')
@UseGuards(JwtAuthGuard)
export class ReturnsController {
  constructor(
    private readonly service: ReturnsService,
    private readonly evidence: ReturnsEvidenceService,
  ) {}
  private rev(value?: string) {
    const n = Number(value?.replace(/^W\//, '').replace(/"/g, ''));
    if (!Number.isInteger(n) || n < 1)
      throw new BadRequestException('If-Match revision is required');
    return n;
  }
  @Get('dashboard') dashboard(@Req() req: { user: InventoryActor }) {
    return this.service.dashboard(req.user);
  }
  @Get('cases') queue(@Req() req: { user: InventoryActor }) {
    return this.service.queue(req.user);
  }
  @Get('cases/:id') detail(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
  ) {
    return this.service.detail(req.user, id);
  }
  @Post('cases') create(
    @Req() req: { user: InventoryActor },
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<ReturnsService['create']>[2],
  ) {
    return this.service.create(req.user, key, body);
  }
  @Post('cases/:id/submit') submit(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
  ) {
    return this.service.submit(req.user, id, this.rev(rev), key);
  }
  @Post('cases/:id/eligibility') evaluate(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<ReturnsService['evaluate']>[4],
  ) {
    return this.service.evaluate(req.user, id, this.rev(rev), key, body);
  }
  @Post('cases/:id/approve') approve(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<ReturnsService['approve']>[4],
  ) {
    return this.service.approve(req.user, id, this.rev(rev), key, body);
  }
  @Post('cases/:id/transition') transition(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<ReturnsService['rejectOrCancel']>[4],
  ) {
    return this.service.rejectOrCancel(req.user, id, this.rev(rev), key, body);
  }
  @Post('cases/:id/communications') communication(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<ReturnsService['addCommunication']>[3],
  ) {
    return this.service.addCommunication(req.user, id, key, body);
  }
  @Post('cases/:id/rma') rma(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<ReturnsService['transitionRma']>[4],
  ) {
    return this.service.transitionRma(req.user, id, this.rev(rev), key, body);
  }
  @Post('cases/:id/shipment') shipment(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<ReturnsService['transitionShipment']>[4],
  ) {
    return this.service.transitionShipment(
      req.user,
      id,
      this.rev(rev),
      key,
      body,
    );
  }
  @Post('cases/:id/reconsider') reconsider(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<ReturnsService['reconsider']>[4],
  ) {
    return this.service.reconsider(req.user, id, this.rev(rev), key, body);
  }
  @Post('cases/:id/resolve') resolve(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<ReturnsService['resolve']>[4],
  ) {
    return this.service.resolve(req.user, id, this.rev(rev), key, body);
  }
  @Post('cases/:id/evidence')
  @UseInterceptors(evidenceInterceptor)
  evidenceUpload(
    @Req() req: { user: InventoryActor },
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
