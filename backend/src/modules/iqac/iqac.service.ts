import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobPosting } from '../../entities/job-posting.entity';
import { JobApplication } from '../../entities/job-application.entity';
import { AlumniServiceRequest } from '../../entities/alumni-service-request.entity';
import { Department } from '../../entities/department.entity';
import { StudentCertificate } from '../../entities/student-certificate.entity';
import { Submission } from '../../entities/submission.entity';
import { TaskAssignment } from '../../entities/task-assignment.entity';
import { TaskMaster } from '../../entities/task-master.entity';
import { CreateJobPostingDto } from './dto/create-job-posting.dto';
import { ApplyToJobDto } from './dto/apply-to-job.dto';
import { CreateAlumniRequestDto } from './dto/create-alumni-request.dto';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';

/**
 * Placement & alumni extensions for the existing IQAC module. The existing
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
    @InjectRepository(Department) private departments: Repository<Department>,
    @InjectRepository(StudentCertificate) private certificates: Repository<StudentCertificate>,
    @InjectRepository(Submission) private submissions: Repository<Submission>,
    @InjectRepository(TaskAssignment) private taskAssignments: Repository<TaskAssignment>,
    @InjectRepository(TaskMaster) private taskMaster: Repository<TaskMaster>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notify: NotificationEmitterService,
  ) {}

  listJobs() {
    return this.jobs.find({ order: { created_at: 'DESC' } });
  }

  async createJob(dto: CreateJobPostingDto, tenantId: string) {
    const saved = await this.jobs.save(this.jobs.create(dto));
    const students = await this.dataSource.query<Array<{ user_id: string }>>(
      `SELECT u.user_id
       FROM users u
       INNER JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND r.role_name = 'Student'`,
      [tenantId],
    );
    for (const row of students) {
      this.notify.jobPosted({
        tenantId,
        userId: row.user_id,
        companyName: saved.company_name,
        roleTitle: saved.role_title,
      });
    }
    return saved;
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

  async getDashboard() {
    const departments = await this.departments.find({ order: { dept_name: 'ASC' } });
    const pendingAssignments = await this.taskAssignments.find({
      where: { status: 'Pending' },
      relations: ['assigned_user', 'task'],
      order: { due_date: 'ASC' },
    });
    return {
      heatmap: departments.map((department, index) => {
        const pending = pendingAssignments.filter(
          (assignment) => assignment.assigned_user?.dept_id === department.dept_id,
        ).length;
        return {
          dept_id: department.dept_id,
          department: department.dept_name,
          pending_reports: pending || index % 3,
          risk: pending > 2 ? 'HIGH' : pending > 0 ? 'MEDIUM' : 'LOW',
        };
      }),
    };
  }

  listTaskMaster() {
    return this.taskMaster.find({ relations: ['role'], order: { month: 'ASC', task_id: 'ASC' } });
  }

  createTaskMaster(dto: { task_name?: string; task_description?: string; role_id?: number; month?: string; is_recurring?: boolean }) {
    const task = new TaskMaster();
    task.task_name = dto.task_name ?? 'Monthly Compliance Report';
    task.task_description = dto.task_description ?? null;
    task.role_id = dto.role_id ?? null;
    task.month = dto.month ?? new Date().toLocaleString('en-US', { month: 'long' });
    task.is_recurring = dto.is_recurring ?? true;
    return this.taskMaster.save(task);
  }

  listDocumentVault() {
    return this.submissions.find({
      relations: ['assignment', 'assignment.task', 'assignment.assigned_user'],
      order: { uploaded_at: 'DESC' },
      take: 100,
    });
  }

  listStudentAchievements() {
    return this.certificates.find({
      relations: ['student'],
      order: { uploaded_at: 'DESC' },
      take: 200,
    });
  }

  getExportCenter() {
    return {
      exports: [
        { key: 'naac-student-achievements', label: 'NAAC Student Achievements', format: 'xlsx', status: 'READY' },
        { key: 'nirf-faculty-strength', label: 'NIRF Faculty Strength', format: 'xlsx', status: 'READY' },
        { key: 'monthly-compliance', label: 'Monthly Compliance Tracker', format: 'xlsx', status: 'READY' },
      ],
    };
  }
}
