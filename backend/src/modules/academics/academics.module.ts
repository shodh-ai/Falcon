import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subject } from '../../entities/subject.entity';
import { Batch } from '../../entities/batch.entity';
import { AttendanceRecord } from '../../entities/attendance-record.entity';
import { ExamResult } from '../../entities/exam-result.entity';
import { GradingPolicy } from '../../entities/grading-policy.entity';
import { AcademicsController } from './academics.controller';
import { AcademicsService } from './academics.service';
import { AcademicsFacultyService } from './academics-faculty.service';

@Module({
  imports: [TypeOrmModule.forFeature([Subject, Batch, AttendanceRecord, ExamResult, GradingPolicy])],
  controllers: [AcademicsController],
  providers: [AcademicsService, AcademicsFacultyService],
  exports: [AcademicsService, AcademicsFacultyService],
})
export class AcademicsModule {}
