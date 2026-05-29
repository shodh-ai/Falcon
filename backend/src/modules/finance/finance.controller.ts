import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, Public } from '../../common/decorators/roles.decorator';
import { FinanceService } from './finance.service';
import { CreateFeeDemandDto } from './dto/create-fee-demand.dto';
import { GatewayWebhookDto } from './dto/gateway-webhook.dto';

@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('demands')
  listDemands(@Query('studentUserId') studentUserId?: string) {
    return this.finance.listDemands(studentUserId);
  }

  @Post('demands')
  @Roles('SuperAdmin', 'Accountant')
  createDemand(@Body() dto: CreateFeeDemandDto) {
    return this.finance.createDemand(dto);
  }

  @Get('transactions')
  listTransactions(@Query('studentUserId') studentUserId?: string) {
    return this.finance.listTransactions(studentUserId);
  }

  @Get('fine-policies')
  listFinePolicies() {
    return this.finance.listFinePolicies();
  }

  @Public()
  @Post('webhook/:provider')
  webhook(@Param('provider') provider: 'razorpay' | 'payu', @Body() dto: GatewayWebhookDto) {
    return this.finance.handleGatewayWebhook(provider, dto);
  }
}
