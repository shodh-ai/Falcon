import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobPosting } from '../../entities/job-posting.entity';
import { JobApplication } from '../../entities/job-application.entity';
import { AlumniServiceRequest } from '../../entities/alumni-service-request.entity';
import { IqacController } from './iqac.controller';
import { IqacService } from './iqac.service';

@Module({
  imports: [TypeOrmModule.forFeature([JobPosting, JobApplication, AlumniServiceRequest])],
  controllers: [IqacController],
  providers: [IqacService],
  exports: [IqacService],
})
export class IqacModule {}
