import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamSchedule } from '../../entities/exam-schedule.entity';
import { ExamApplication } from '../../entities/exam-application.entity';
import { AttendanceRecord } from '../../entities/attendance-record.entity';
import { User } from '../../entities/user.entity';
import { FinanceModule } from '../finance/finance.module';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';
import { AdmitCardPdfService } from './pdf/admit-card-pdf.service';

@Module({
  imports: [TypeOrmModule.forFeature([ExamSchedule, ExamApplication, AttendanceRecord, User]), FinanceModule],
  controllers: [ExamsController],
  providers: [ExamsService, AdmitCardPdfService],
  exports: [ExamsService, AdmitCardPdfService],
})
export class ExamsModule {}
