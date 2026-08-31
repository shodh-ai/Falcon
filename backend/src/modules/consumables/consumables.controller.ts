import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { InventoryActor } from '../inventory/inventory.types';
import { ConsumablesService } from './consumables.service';

@Controller('api/consumables/v1')
@UseGuards(JwtAuthGuard)
export class ConsumablesController {
  constructor(private readonly service: ConsumablesService) {}
  private revision(value?: string) {
    const n = Number(value?.replace(/^W\//, '').replace(/"/g, ''));
    if (!Number.isInteger(n) || n < 1)
      throw new BadRequestException('If-Match revision is required');
    return n;
  }
  @Get('dashboard') dashboard(@Req() req: { user: InventoryActor }) {
    return this.service.dashboard(req.user);
  }
  @Get('balances') balances(@Req() req: { user: InventoryActor }) {
    return this.service.balances(req.user);
  }
  @Get('requests') requests(@Req() req: { user: InventoryActor }) {
    return this.service.queue(req.user);
  }
  @Post('requests') create(
    @Req() req: { user: InventoryActor },
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<ConsumablesService['create']>[2],
  ) {
    return this.service.create(req.user, key, body);
  }
  @Post('requests/:id/submit') submit(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
  ) {
    return this.service.submit(req.user, id, this.revision(rev), key);
  }
  @Post('requests/:id/approve') approve(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<ConsumablesService['approve']>[4],
  ) {
    return this.service.approve(req.user, id, this.revision(rev), key, body);
  }
  @Post('requests/:id/issue') issue(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<ConsumablesService['issue']>[4],
  ) {
    return this.service.issue(req.user, id, this.revision(rev), key, body);
  }
  @Post('requests/:id/transition') transition(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<ConsumablesService['releaseRequest']>[4],
  ) {
    return this.service.releaseRequest(
      req.user,
      id,
      this.revision(rev),
      key,
      body,
    );
  }
  @Get('issues') issues(@Req() req: { user: InventoryActor }) {
    return this.service.issues(req.user);
  }
  @Post('issues/:id/acknowledge') acknowledge(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
  ) {
    return this.service.acknowledge(req.user, id, key);
  }
  @Post('issues/:id/custody') custody(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<ConsumablesService['custody']>[3],
  ) {
    return this.service.custody(req.user, id, key, body);
  }
  @Post('issues/emergency') emergency(
    @Req() req: { user: InventoryActor },
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<ConsumablesService['emergencyIssue']>[2],
  ) {
    return this.service.emergencyIssue(req.user, key, body);
  }
  @Post('issues/:id/emergency-review') emergencyReview(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<ConsumablesService['reviewEmergency']>[3],
  ) {
    return this.service.reviewEmergency(req.user, id, key, body);
  }
  @Get('counts') counts(@Req() req: { user: InventoryActor }) {
    return this.service.counts(req.user);
  }
  @Post('counts') createCount(
    @Req() req: { user: InventoryActor },
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<ConsumablesService['createCount']>[2],
  ) {
    return this.service.createCount(req.user, key, body);
  }
  @Post('counts/:id/submit') submitCount(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<ConsumablesService['submitCount']>[4],
  ) {
    return this.service.submitCount(
      req.user,
      id,
      this.revision(rev),
      key,
      body,
    );
  }
  @Post('counts/:id/review') reviewCount(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Headers('if-match') rev: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<ConsumablesService['reviewCount']>[4],
  ) {
    return this.service.reviewCount(
      req.user,
      id,
      this.revision(rev),
      key,
      body,
    );
  }
  @Get('alerts') alerts(@Req() req: { user: InventoryActor }) {
    return this.service.alerts(req.user);
  }
  @Post('alerts/:id/acknowledge') alertAck(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
  ) {
    return this.service.acknowledgeAlert(req.user, id, key);
  }
  @Get('policies') policies(@Req() req: { user: InventoryActor }) {
    return this.service.policies(req.user);
  }
  @Post('policies/publish') publishPolicy(
    @Req() req: { user: InventoryActor },
    @Headers('idempotency-key') key: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.publishPolicy(req.user, key, body);
  }
  @Get('replenishment') suggestions(@Req() req: { user: InventoryActor }) {
    return this.service.suggestions(req.user);
  }
  @Post('replenishment/:id/convert') convert(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<ConsumablesService['convertSuggestion']>[3],
  ) {
    return this.service.convertSuggestion(req.user, id, key, body);
  }
}
