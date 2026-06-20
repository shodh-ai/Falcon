import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CampusWalletService } from './campus-wallet.service';

type AuthUser = { user_id: string; tenant_id?: string };

/** Alias routes: POST /api/mess/order, POST /api/mess/redeem-order */
@Controller('api/mess')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MessOrderController {
  constructor(private readonly wallet: CampusWalletService) {}

  @Post('order')
  @Roles('Student')
  order(
    @Req() req: { user: AuthUser },
    @Body()
    dto: {
      order_date: string;
      items: { item_id: string; meal_type: string; quantity?: number }[];
    },
  ) {
    const tenantId =
      req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
    return this.wallet.placeOrder(tenantId, req.user.user_id, dto);
  }

  @Post('redeem-order')
  @Roles('Warden', 'SuperAdmin', 'Faculty')
  redeemOrder(
    @Req() req: { user: AuthUser },
    @Body() dto: { claim_pin_or_qr: string },
  ) {
    const tenantId =
      req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
    return this.wallet.redeemOrder(tenantId, dto.claim_pin_or_qr);
  }
}
