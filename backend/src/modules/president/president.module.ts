import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeeDemand } from '../../entities/fee-demand.entity';
import { StaffPayslip } from '../../entities/staff-payslip.entity';
import { StudentCourseEnrollment } from '../../entities/student-course-enrollment.entity';
import { TaskAssignment } from '../../entities/task-assignment.entity';
import { User } from '../../entities/user.entity';
import { CertificateAutomationModule } from '../certificate-automation/certificate-automation.module';
import { LeadershipModule } from '../leadership/leadership.module';
import { PresidentController } from './president.controller';
import { PresidentExecutiveWorkflowService } from './president-executive-workflow.service';
import { PresidentService } from './president.service';

@Module({
  imports: [
    LeadershipModule,
    CertificateAutomationModule,
    TypeOrmModule.forFeature([
      User,
      FeeDemand,
      StudentCourseEnrollment,
      TaskAssignment,
      StaffPayslip,
    ]),
  ],
  controllers: [PresidentController],
  providers: [PresidentService, PresidentExecutiveWorkflowService],
  exports: [PresidentService],
})
export class PresidentModule {}
