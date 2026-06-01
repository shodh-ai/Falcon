import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaveRequest } from '../../entities/leave-request.entity';
import { LeaveBalance } from '../../entities/leave-balance.entity';
import { StaffAttendance } from '../../entities/staff-attendance.entity';
import { StaffLeaveRequest } from '../../entities/staff-leave-request.entity';
import { StaffPayslip } from '../../entities/staff-payslip.entity';
import { StaffGatePass } from '../../entities/staff-gate-pass.entity';
import { User } from '../../entities/user.entity';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LeaveRequest,
      LeaveBalance,
      StaffAttendance,
      StaffLeaveRequest,
      StaffPayslip,
      StaffGatePass,
      User,
    ]),
  ],
  controllers: [HrController],
  providers: [HrService],
  exports: [HrService],
})
export class HrModule {}
