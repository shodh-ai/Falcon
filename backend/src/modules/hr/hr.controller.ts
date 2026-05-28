import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { HrService } from './hr.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { LeaveActionDto } from './dto/leave-action.dto';
import type { LeaveRequestStatus } from '../../entities/leave-request.entity';

@Controller('hr')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HrController {
  constructor(private readonly hr: HrService) {}

  @Post('leaves')
  createLeave(@Body() dto: CreateLeaveRequestDto) {
    return this.hr.createLeaveRequest(dto);
  }

  @Get('leaves')
  listLeaves(
    @Query('userId') userId?: string,
    @Query('status') status?: LeaveRequestStatus,
  ) {
    return this.hr.listLeaveRequests(userId, status);
  }

  @Patch('leaves/:id/action')
  @Roles('HOD', 'Dean', 'HR', 'Admin')
  act(@Param('id') id: string, @Body() dto: LeaveActionDto) {
    return this.hr.actOnLeave(id, dto);
  }

  @Get('balances/:userId')
  balances(@Param('userId') userId: string) {
    return this.hr.listBalances(userId);
  }

  @Post('staff-attendance/:userId/check-in')
  @Roles('HR', 'Admin', 'Faculty', 'HOD')
  checkIn(@Param('userId') userId: string, @Body('work_date') workDate: string) {
    return this.hr.recordStaffAttendance(userId, workDate);
  }
}
