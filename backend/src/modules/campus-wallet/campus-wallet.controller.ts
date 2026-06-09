import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CampusWalletService } from './campus-wallet.service';

type AuthUser = { user_id: string; tenant_id?: string };

@Controller('api/campus-wallet')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CampusWalletController {
  constructor(private readonly wallet: CampusWalletService) {}

  @Get('me')
  @Roles('Student')
  myWallet(@Req() req: { user: AuthUser }) {
    return this.wallet.getOrCreateWallet(this.tenant(req), req.user.user_id);
  }

  @Get('ledger')
  @Roles('Student')
  ledger(@Req() req: { user: AuthUser }) {
    return this.wallet.getLedger(this.tenant(req), req.user.user_id);
  }

  @Post('top-up')
  @Roles('Student', 'SuperAdmin')
  topUp(@Req() req: { user: AuthUser }, @Body() dto: { amount: number; reference_id: string }) {
    return this.wallet.topUp(this.tenant(req), req.user.user_id, dto.amount, dto.reference_id);
  }

  @Get('mess/catalog')
  @Roles('Student', 'SuperAdmin', 'Warden')
  catalog(@Req() req: { user: AuthUser }) {
    return this.wallet.listCatalog(this.tenant(req));
  }

  @Get('mess/daily-menu')
  @Roles('Student')
  dailyMenu(@Req() req: { user: AuthUser }, @Query('date') date?: string) {
    const orderDate = date ?? new Date().toISOString().slice(0, 10);
    return this.wallet.getDailyMenu(this.tenant(req), orderDate);
  }

  @Get('mess/order-window')
  @Roles('Student')
  orderWindow() {
    return this.wallet.getOrderWindow();
  }

  @Post('mess/pre-order')
  @Roles('Student')
  preOrder(
    @Req() req: { user: AuthUser },
    @Body() dto: { item_id: string; order_date: string; meal_type: string },
  ) {
    return this.wallet.preOrderAddon(this.tenant(req), req.user.user_id, dto);
  }

  @Post('mess/order')
  @Roles('Student')
  placeOrder(
    @Req() req: { user: AuthUser },
    @Body() dto: { order_date: string; items: { item_id: string; meal_type: string; quantity?: number }[] },
  ) {
    return this.wallet.placeOrder(this.tenant(req), req.user.user_id, dto);
  }

  @Get('mess/my-orders')
  @Roles('Student')
  myOrders(@Req() req: { user: AuthUser }, @Query('all') all?: string) {
    return this.wallet.listMyOrders(this.tenant(req), req.user.user_id, all !== 'true');
  }

  @Get('mess/qr')
  @Roles('Student')
  mealQr(@Req() req: { user: AuthUser }) {
    return this.wallet.generateMealToken(this.tenant(req), req.user.user_id);
  }

  @Post('mess/scan')
  @Roles('Warden', 'SuperAdmin', 'Faculty')
  scan(@Req() req: { user: AuthUser }, @Body() dto: { qr_payload: string }) {
    return this.wallet.scanMealToken(this.tenant(req), dto.qr_payload);
  }

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }
}
