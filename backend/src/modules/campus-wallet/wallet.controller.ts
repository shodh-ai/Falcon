import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CampusWalletService } from './campus-wallet.service';

type AuthUser = { user_id: string; tenant_id?: string };

/** Alias routes: POST /api/wallet/topup */
@Controller('api/wallet')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WalletController {
  constructor(private readonly wallet: CampusWalletService) {}

  @Post('topup/order')
  @Roles('Student')
  topUpOrder(@Req() req: { user: AuthUser }, @Body() dto: { amount: number }) {
    const tenantId = req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
    return this.wallet.createWalletTopUpOrder(tenantId, req.user.user_id, dto.amount);
  }

  @Post('topup')
  @Roles('Student')
  topUp(
    @Req() req: { user: AuthUser },
    @Body() dto: { amount: number; payment_id?: string; order_id?: string },
  ) {
    const tenantId = req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
    return this.wallet.confirmWalletTopUpMock(tenantId, req.user.user_id, dto.amount, dto.payment_id);
  }
}
