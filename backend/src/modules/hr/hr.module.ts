import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HrFieldEncryptionService } from '../../common/crypto/hr-field-encryption.service';
import { LeaveRequest } from '../../entities/leave-request.entity';
import { LeaveBalance } from '../../entities/leave-balance.entity';
import { StaffAttendance } from '../../entities/staff-attendance.entity';
import { StaffLeaveRequest } from '../../entities/staff-leave-request.entity';
import { StaffPayslip } from '../../entities/staff-payslip.entity';
import { StaffGatePass } from '../../entities/staff-gate-pass.entity';
import { User } from '../../entities/user.entity';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';
import { HrAdminService } from './hr-admin.service';

@Module({
  imports: [
    ConfigModule,
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
  providers: [HrService, HrAdminService, HrFieldEncryptionService],
  exports: [HrService, HrAdminService, HrFieldEncryptionService],
})
export class HrModule {}
