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
import { HrHoliday } from '../../entities/hr-holiday.entity';
import { HrShift } from '../../entities/hr-shift.entity';
import { HrEmployeeProfile } from '../../entities/hr-employee-profile.entity';
import { HrDailyAttendance } from '../../entities/hr-daily-attendance.entity';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';
import { HrAdminService } from './hr-admin.service';
import { HrWorkforceService } from './hr-workforce.service';
import { AttendanceCalculationService } from './attendance-calculation.service';
import { HrEntityContextService } from './hr-entity-context.service';
import { HrRulesService } from './hr-rules.service';
import { HrEssService } from './hr-ess.service';
import { HrDynamicRulesService } from './hr-dynamic-rules.service';
import { HrOrgStructureService } from './hr-org-structure.service';
import { HrLeavePolicyService } from './hr-leave-policy.service';
import { HrWorkflowBuilderService } from './hr-workflow-builder.service';
import { HrChecklistService } from './hr-checklist.service';
import { HrPermissionGuard } from '../../common/guards/hr-permission.guard';
import { HrDashboardService } from './hr-dashboard.service';
import { HrReportsService } from './hr-reports.service';

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
      HrHoliday,
      HrShift,
      HrEmployeeProfile,
      HrDailyAttendance,
    ]),
  ],
  controllers: [HrController],
  providers: [
    HrService,
    HrAdminService,
    HrWorkforceService,
    AttendanceCalculationService,
    HrFieldEncryptionService,
    HrEntityContextService,
    HrRulesService,
    HrEssService,
    HrDynamicRulesService,
    HrOrgStructureService,
    HrLeavePolicyService,
    HrWorkflowBuilderService,
    HrChecklistService,
    HrPermissionGuard,
    HrDashboardService,
    HrReportsService,
  ],
  exports: [
    HrService,
    HrAdminService,
    HrWorkforceService,
    AttendanceCalculationService,
    HrFieldEncryptionService,
    HrEntityContextService,
    HrRulesService,
    HrEssService,
    HrDynamicRulesService,
    HrOrgStructureService,
    HrLeavePolicyService,
    HrWorkflowBuilderService,
    HrChecklistService,
    HrDashboardService,
    HrReportsService,
  ],
})
export class HrModule {}
