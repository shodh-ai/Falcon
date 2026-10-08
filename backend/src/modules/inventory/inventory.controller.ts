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
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { InventoryService } from './inventory.service';
import type {
  EncodeRfidInput,
  InventoryActor,
  MovementType,
  PrepareIdentityInput,
} from './inventory.types';

@Controller('api/inventory/v1')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}
  private revision(value?: string) {
    const revision = Number(value?.replace(/^W\//, '').replace(/"/g, ''));
    if (!Number.isInteger(revision) || revision <= 0)
      throw new BadRequestException('If-Match revision is required');
    return revision;
  }

  @Get('dashboard') dashboard(@Req() req: { user: InventoryActor }) {
    return this.inventory.dashboard(req.user);
  }
  @Post('policies/identifiers/publish') publishIdentifierPolicy(
    @Req() req: { user: InventoryActor },
    @Body()
    body: {
      product_pattern: string;
      batch_pattern: string;
      asset_pattern: string;
      rfid_pattern: string;
      lot_pattern: string;
    },
  ) {
    return this.inventory.publishIdentifierPolicy(req.user, body);
  }
  @Get('policies') policies(@Req() req: { user: InventoryActor }) {
    return this.inventory.policies(req.user);
  }
  @Post('policies/categories/publish') publishCategoryPolicy(
    @Req() req: { user: InventoryActor },
    @Body()
    body: {
      category?: string;
      subject_type: 'ITEM' | 'LOT';
      required_attributes?: string[];
      manufacturer_serial_required?: boolean;
      rfid_required?: boolean;
    },
  ) {
    return this.inventory.publishCategoryPolicy(req.user, body);
  }
  @Get('legacy/reconciliation') legacyQueue(
    @Req() req: { user: InventoryActor },
  ) {
    return this.inventory.legacyQueue(req.user);
  }
  @Post('legacy/reconciliation') reconcileLegacy(
    @Req() req: { user: InventoryActor },
    @Headers('idempotency-key') key: string,
    @Body()
    body: {
      legacy_source: 'university_assets' | 'inventory_items';
      legacy_record_id: string;
      candidate_inventory_record_id?: string;
      decision: 'RECONCILIATION_REQUIRED' | 'RECONCILED' | 'REJECTED_DUPLICATE';
      reason: string;
    },
  ) {
    return this.inventory.reconcileLegacy(req.user, key, body);
  }
  @Get('records') list(
    @Req() req: { user: InventoryActor },
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.inventory.list(req.user, search, status);
  }
  @Get('records/:id') get(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
  ) {
    return this.inventory.get(req.user, id);
  }
  @Post('records/:id/identity/prepare') prepare(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body() body: PrepareIdentityInput,
  ) {
    return this.inventory.prepareIdentity(
      req.user,
      id,
      this.revision(revision),
      key,
      body,
    );
  }
  @Post('records/:id/rfid/encode') encode(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body() body: EncodeRfidInput,
  ) {
    return this.inventory.encodeRfid(
      req.user,
      id,
      this.revision(revision),
      key,
      body,
    );
  }
  @Post('records/:id/rfid/:bindingId/verify') verify(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Param('bindingId') bindingId: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
  ) {
    return this.inventory.verifyRfid(
      req.user,
      id,
      bindingId,
      this.revision(revision),
      key,
    );
  }
  @Post('records/:id/activate') activate(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
  ) {
    return this.inventory.activate(req.user, id, this.revision(revision), key);
  }
  @Post('records/:id/rfid/revoke') revokeRfid(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body() body: { reason: string; status?: 'LOST' | 'REVOKED' },
  ) {
    return this.inventory.revokeRfid(
      req.user,
      id,
      this.revision(revision),
      key,
      body,
    );
  }
  @Post('records/:id/state-changes') requestState(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body()
    body: {
      dimension:
        | 'OWNERSHIP'
        | 'CUSTODY'
        | 'LOCATION'
        | 'CONDITION'
        | 'LIFECYCLE';
      new_value: Record<string, unknown>;
      reason: string;
    },
  ) {
    return this.inventory.requestStateChange(
      req.user,
      id,
      this.revision(revision),
      key,
      body,
    );
  }
  @Post('records/:id/state-changes/:historyId/acknowledge') acknowledgeState(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Param('historyId') historyId: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
  ) {
    return this.inventory.acknowledgeStateChange(
      req.user,
      id,
      historyId,
      this.revision(revision),
      key,
    );
  }
  @Post('records/:id/lot-movements') movement(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body()
    body: {
      movement_type: MovementType;
      quantity: number;
      reason: string;
      evidence_reference?: string;
    },
  ) {
    return this.inventory.lotMovement(
      req.user,
      id,
      this.revision(revision),
      key,
      body,
    );
  }
  @Post('records/:id/lot-transfers') transfer(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body() body: { destination_id: string; quantity: number; reason: string },
  ) {
    return this.inventory.transferLot(
      req.user,
      id,
      this.revision(revision),
      key,
      body,
    );
  }
  @Post('records/:id/discrepancies') report(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body()
    body: {
      discrepancy_type: string;
      description: string;
      severity?: string;
      evidence?: unknown[];
    },
  ) {
    return this.inventory.reportDiscrepancy(
      req.user,
      id,
      this.revision(revision),
      key,
      body,
    );
  }
  @Post('records/:id/discrepancies/:discrepancyId/resolve') resolve(
    @Req() req: { user: InventoryActor },
    @Param('id') id: string,
    @Param('discrepancyId') discrepancyId: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body()
    body: {
      resolution: string;
      reason: string;
      correction?: Record<string, unknown>;
    },
  ) {
    return this.inventory.resolveDiscrepancy(
      req.user,
      id,
      discrepancyId,
      this.revision(revision),
      key,
      body,
    );
  }
  @Public() @Get('scan/:code') scan(@Param('code') code: string) {
    return this.inventory.publicScan(code);
  }
}
