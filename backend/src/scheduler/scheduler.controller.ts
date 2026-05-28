import { Controller, Post, Body, UseGuards, Get } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('scheduler')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SchedulerController {
  constructor(private readonly schedulerService: SchedulerService) {}

  @Post('distribute')
  @Roles('IQAC', 'HR')
  manualDistributeTasks(@Body('month') month: string) {
    return this.schedulerService.manualDistributeTasks(month);
  }

  @Post('reminders')
  @Roles('IQAC', 'HR')
  manualSendReminders(@Body('month') month: string) {
    return this.schedulerService.manualSendReminders(month);
  }

  @Post('report')
  @Roles('IQAC', 'HR', 'President')
  manualGenerateReport(@Body('month') month: string) {
    return this.schedulerService.manualGenerateReport(month);
  }
}
