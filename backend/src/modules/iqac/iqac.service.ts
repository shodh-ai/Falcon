import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobPosting } from '../../entities/job-posting.entity';
import { JobApplication } from '../../entities/job-application.entity';
import { AlumniServiceRequest } from '../../entities/alumni-service-request.entity';
import { CreateJobPostingDto } from './dto/create-job-posting.dto';
import { ApplyToJobDto } from './dto/apply-to-job.dto';
import { CreateAlumniRequestDto } from './dto/create-alumni-request.dto';

/**
 * Placement & alumni extensions for the existing IQAC module. The legacy
 * task/submission/AI-audit flow continues to live under `src/tasks/*` and
 * `src/ai-document/*`; this service adds the new placement + alumni
 * surfaces called out in the master blueprint.
 */
@Injectable()
export class IqacService {
  constructor(
    @InjectRepository(JobPosting) private jobs: Repository<JobPosting>,
    @InjectRepository(JobApplication) private jobApplications: Repository<JobApplication>,
    @InjectRepository(AlumniServiceRequest) private alumniRequests: Repository<AlumniServiceRequest>,
  ) {}

  listJobs() {
    return this.jobs.find({ order: { created_at: 'DESC' } });
  }

  createJob(dto: CreateJobPostingDto) {
    return this.jobs.save(this.jobs.create(dto));
  }

  async applyToJob(jobId: string, dto: ApplyToJobDto) {
    const job = await this.jobs.findOne({ where: { job_id: jobId } });
    if (!job) throw new BadRequestException('Job posting not found');

    if (job.one_student_one_job) {
      const acceptedElsewhere = await this.jobApplications.findOne({
        where: { student_user_id: dto.student_user_id, status: 'ACCEPTED' },
      });
      if (acceptedElsewhere) {
        throw new BadRequestException(
          'Student already accepted an offer; "one student one job" policy blocks further applications.',
        );
      }
    }

    const entity = this.jobApplications.create({
      job_id: jobId,
      student_user_id: dto.student_user_id,
      responses: dto.responses,
    });
    return this.jobApplications.save(entity);
  }

  listAlumniRequests(alumniUserId?: string) {
    if (alumniUserId) {
      return this.alumniRequests.find({ where: { alumni_user_id: alumniUserId }, order: { created_at: 'DESC' } });
    }
    return this.alumniRequests.find({ order: { created_at: 'DESC' } });
  }

  createAlumniRequest(dto: CreateAlumniRequestDto) {
    return this.alumniRequests.save(this.alumniRequests.create(dto));
  }
}
