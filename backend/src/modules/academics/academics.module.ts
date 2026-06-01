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
import { AcademicAssignment } from '../../entities/academic-assignment.entity';
import { AssignmentSubmission } from '../../entities/assignment-submission.entity';
import { CourseAttendanceLog } from '../../entities/course-attendance-log.entity';
import { CourseMaterial } from '../../entities/course-material.entity';
import { CourseModule } from '../../entities/course-module.entity';
import { FeeDemand } from '../../entities/fee-demand.entity';
import { StudentProfile } from '../../entities/student-profile.entity';
import { StudentCertificate } from '../../entities/student-certificate.entity';
import { ProctorInteraction } from '../../entities/proctor-interaction.entity';
import { StaffAttendance } from '../../entities/staff-attendance.entity';
import { StaffLeaveRequest } from '../../entities/staff-leave-request.entity';
import { StaffGatePass } from '../../entities/staff-gate-pass.entity';
import { User } from '../../entities/user.entity';
import { AcademicsController } from './academics.controller';
import { AcademicsService } from './academics.service';
import { AcademicsFacultyService } from './academics-faculty.service';
import { ProctorController } from './proctor.controller';
import { ProctorService } from './proctor.service';
import { CertificatesController } from './certificates.controller';
import { CertificatesService } from './certificates.service';
import { AssignmentsService } from './assignments.service';
import { FacultyWorkspacesService } from './faculty-workspaces.service';
import { CourseLmsService } from './course-lms.service';
import { MarksheetPdfService } from './pdf/marksheet-pdf.service';
import { MarksHistoryService } from './marks-history.service';
import { StorageModule } from '../../storage/storage.module';

@Module({
  imports: [
    StorageModule,
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
      AcademicAssignment,
      AssignmentSubmission,
      CourseAttendanceLog,
      CourseMaterial,
      CourseModule,
      FeeDemand,
      StudentProfile,
      StudentCertificate,
      ProctorInteraction,
      StaffAttendance,
      StaffLeaveRequest,
      StaffGatePass,
      User,
    ]),
  ],
  controllers: [AcademicsController, ProctorController, CertificatesController],
  providers: [
    AcademicsService,
    AcademicsFacultyService,
    ProctorService,
    CertificatesService,
    AssignmentsService,
    FacultyWorkspacesService,
    CourseLmsService,
    MarksheetPdfService,
    MarksHistoryService,
  ],
  exports: [
    AcademicsService,
    AcademicsFacultyService,
    ProctorService,
    CertificatesService,
    AssignmentsService,
    FacultyWorkspacesService,
    CourseLmsService,
    MarksheetPdfService,
    MarksHistoryService,
  ],
})
export class AcademicsModule {}
