import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeeDemand } from '../../entities/fee-demand.entity';
import { StaffPayslip } from '../../entities/staff-payslip.entity';
import { StudentCourseEnrollment } from '../../entities/student-course-enrollment.entity';
import { TaskAssignment } from '../../entities/task-assignment.entity';
import { User } from '../../entities/user.entity';
import { PresidentController } from './president.controller';
import { PresidentService } from './president.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, FeeDemand, StudentCourseEnrollment, TaskAssignment, StaffPayslip])],
  controllers: [PresidentController],
  providers: [PresidentService],
})
export class PresidentModule {}
