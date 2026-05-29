import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subject } from '../../entities/subject.entity';
import { Batch } from '../../entities/batch.entity';
import { AttendanceRecord } from '../../entities/attendance-record.entity';
import { ExamResult } from '../../entities/exam-result.entity';
import { GradingPolicy } from '../../entities/grading-policy.entity';
import { AcademicMentorship } from '../../entities/academic-mentorship.entity';
import { AcademicCourse } from '../../entities/academic-course.entity';
import { StudentCourseEnrollment } from '../../entities/student-course-enrollment.entity';
import { AcademicTimetable } from '../../entities/academic-timetable.entity';
import { StudentProfile } from '../../entities/student-profile.entity';
import { StudentCertificate } from '../../entities/student-certificate.entity';
import { ProctorInteraction } from '../../entities/proctor-interaction.entity';
import { User } from '../../entities/user.entity';
import { AcademicsController } from './academics.controller';
import { AcademicsService } from './academics.service';
import { AcademicsFacultyService } from './academics-faculty.service';
import { ProctorController } from './proctor.controller';
import { ProctorService } from './proctor.service';
import { CertificatesController } from './certificates.controller';
import { CertificatesService } from './certificates.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Subject,
      Batch,
      AttendanceRecord,
      ExamResult,
      GradingPolicy,
      AcademicMentorship,
      AcademicCourse,
      StudentCourseEnrollment,
      AcademicTimetable,
      StudentProfile,
      StudentCertificate,
      ProctorInteraction,
      User,
    ]),
  ],
  controllers: [AcademicsController, ProctorController, CertificatesController],
  providers: [AcademicsService, AcademicsFacultyService, ProctorService, CertificatesService],
  exports: [AcademicsService, AcademicsFacultyService, ProctorService, CertificatesService],
})
export class AcademicsModule {}
