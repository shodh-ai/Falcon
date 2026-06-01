import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobPosting } from '../../entities/job-posting.entity';
import { JobApplication } from '../../entities/job-application.entity';
import { AlumniServiceRequest } from '../../entities/alumni-service-request.entity';
import { Department } from '../../entities/department.entity';
import { StudentCertificate } from '../../entities/student-certificate.entity';
import { Submission } from '../../entities/submission.entity';
import { TaskAssignment } from '../../entities/task-assignment.entity';
import { TaskMaster } from '../../entities/task-master.entity';
import { IqacController } from './iqac.controller';
import { IqacService } from './iqac.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      JobPosting,
      JobApplication,
      AlumniServiceRequest,
      Department,
      StudentCertificate,
      Submission,
      TaskAssignment,
      TaskMaster,
    ]),
  ],
  controllers: [IqacController],
  providers: [IqacService],
  exports: [IqacService],
})
export class IqacModule {}
