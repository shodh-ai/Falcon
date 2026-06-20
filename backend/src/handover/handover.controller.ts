import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { HandoverService } from './handover.service';
import { CreateHandoverDto } from './dto/create-handover.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('handover')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HandoverController {
  constructor(private readonly handoverService: HandoverService) {}

  @Post()
  @Roles('IQAC', 'HR')
  performHandover(
    @Body() createHandoverDto: CreateHandoverDto,
    @Req() req: any,
  ) {
    return this.handoverService.performHandover(
      createHandoverDto,
      req.user.user_id,
    );
  }

  @Get('history')
  @Roles('IQAC', 'HR', 'President', 'Dean')
  getHandoverHistory(@Req() req: any) {
    if (
      req.user.role === 'IQAC' ||
      req.user.role === 'HR' ||
      req.user.role === 'President'
    ) {
      return this.handoverService.getHandoverHistory();
    }
    return this.handoverService.getHandoverHistory(req.user.user_id);
  }

  @Get('history/:userId')
  @Roles('IQAC', 'HR', 'President')
  getHandoverHistoryForUser(@Param('userId') userId: string) {
    return this.handoverService.getHandoverHistory(userId);
  }

  @Get(':id')
  @Roles('IQAC', 'HR', 'President', 'Dean')
  getHandoverLog(@Param('id') id: string) {
    return this.handoverService.getHandoverLog(id);
  }
}
