import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { HostelTatkalService } from './hostel-tatkal.service';

type AuthUser = { user_id: string; tenant_id?: string };

@Controller('api/hostel-tatkal')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HostelTatkalController {
  constructor(private readonly tatkal: HostelTatkalService) {}

  @Get('sale/active')
  @Roles('Student', 'SuperAdmin', 'Warden')
  activeSale(@Req() req: { user: AuthUser }) {
    return this.tatkal.getActiveSale(this.tenant(req));
  }

  @Get('map')
  @Roles('Student', 'SuperAdmin', 'Warden')
  map(@Req() req: { user: AuthUser }) {
    return this.tatkal.getSaleMap(this.tenant(req));
  }

  @Get('catalog')
  @Roles('Student', 'SuperAdmin', 'Warden')
  catalog(@Req() req: { user: AuthUser }) {
    return this.tatkal.getBookingCatalog(this.tenant(req));
  }

  @Post('lock-bed')
  @Roles('Student')
  lockBed(@Req() req: { user: AuthUser }, @Body() dto: { bed_id: string }) {
    return this.tatkal.lockBed(this.tenant(req), req.user.user_id, dto.bed_id);
  }

  @Get('holds/:holdId')
  @Roles('Student')
  getHold(@Req() req: { user: AuthUser }, @Param('holdId') holdId: string) {
    return this.tatkal.getHold(this.tenant(req), req.user.user_id, holdId);
  }

  @Post('holds/:holdId/release')
  @Roles('Student')
  releaseHold(@Req() req: { user: AuthUser }, @Param('holdId') holdId: string) {
    return this.tatkal.releaseHold(this.tenant(req), req.user.user_id, holdId);
  }

  @Post('holds/:holdId/pay/order')
  @Roles('Student')
  payOrder(@Req() req: { user: AuthUser }, @Param('holdId') holdId: string) {
    return this.tatkal.createPaymentOrder(
      this.tenant(req),
      req.user.user_id,
      holdId,
    );
  }

  @Post('confirm-payment')
  @Roles('Student')
  confirm(
    @Req() req: { user: AuthUser },
    @Body() dto: { hold_id: string; payment_ref: string },
  ) {
    return this.tatkal.confirmPayment(
      this.tenant(req),
      req.user.user_id,
      dto.hold_id,
      dto.payment_ref,
    );
  }

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }
}
