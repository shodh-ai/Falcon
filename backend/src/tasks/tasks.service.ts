import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { TaskMaster } from '../entities/task-master.entity';
import { TaskAssignment } from '../entities/task-assignment.entity';
import { Submission } from '../entities/submission.entity';
import { User } from '../entities/user.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { SUBMISSION_AI_QUEUE } from '../common/constants/ai-queue.constants';
import { AiSubmissionStatus } from '../common/enums/ai-submission-status.enum';
import { EnterpriseAuditService } from '../core/audit/enterprise-audit.service';

function submissionIncludesPdf(dto: CreateSubmissionDto): boolean {
  return recordIncludesPdf(dto.file_path ?? null, dto.file_type ?? null);
}

function recordIncludesPdf(
  filePath?: string | null,
  fileType?: string | null,
): boolean {
  if (!filePath?.trim()) return false;
  const types = (fileType || '').toLowerCase();
  if (types.includes('pdf')) return true;
  return filePath
    .split(',')
    .some((p) => p.trim().toLowerCase().endsWith('.pdf'));
}

export type TaskRequestScope = {
  userId: string;
  tenantId: string;
  deptId?: number | null;
  roles?: string[];
};

const DEFAULT_TENANT_ID = 'a0000000-0000-4000-8000-000000000001';
const REVIEW_DECISIONS = ['ACCEPTED', 'CHANGES_REQUESTED', 'WAIVED'] as const;

export function monthNameToNumber(month: string): number {
  const value = new Date(`${month} 1, 2000`).getMonth();
  if (!Number.isInteger(value) || value < 0 || value > 11) {
    throw new BadRequestException(`Invalid month: ${month}`);
  }
  return value + 1;
}

export function calculateCycleDueDate(
  year: number,
  month: number,
  policy = 'MONTH_END',
): Date {
  if (month < 1 || month > 12)
    throw new BadRequestException('Invalid cycle month');
  const day = policy === 'DAY_25' ? 25 : new Date(year, month, 0).getDate();
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59));
}

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(TaskMaster)
    private taskMasterRepository: Repository<TaskMaster>,
    @InjectRepository(TaskAssignment)
    private taskAssignmentRepository: Repository<TaskAssignment>,
    @InjectRepository(Submission)
    private submissionRepository: Repository<Submission>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private readonly configService: ConfigService,
    @InjectQueue(SUBMISSION_AI_QUEUE) private readonly submissionAiQueue: Queue,
    private readonly enterpriseAudit: EnterpriseAuditService,
  ) {}

  // Task Master CRUD Operations
  async createTask(
    createTaskDto: CreateTaskDto,
    scope?: TaskRequestScope,
  ): Promise<TaskMaster> {
    const task = this.taskMasterRepository.create({
      ...createTaskDto,
      tenant_id:
        scope?.tenantId ?? createTaskDto.tenant_id ?? DEFAULT_TENANT_ID,
      dept_id: createTaskDto.dept_id ?? scope?.deptId ?? null,
      academic_year: createTaskDto.academic_year ?? this.currentAcademicYear(),
      due_date_policy: createTaskDto.due_date_policy ?? 'MONTH_END',
      evidence_requirements: createTaskDto.evidence_requirements ?? [],
      source_module: createTaskDto.source_module ?? null,
      owner_label: createTaskDto.owner_label ?? null,
      default_assignee_id: createTaskDto.default_assignee_id ?? null,
      source_reference: createTaskDto.source_reference ?? null,
      source_hash: createTaskDto.source_hash ?? null,
    });
    return this.taskMasterRepository.save(task);
  }

  async findAllTasks(tenantId?: string): Promise<TaskMaster[]> {
    return this.taskMasterRepository.find({
      where: tenantId ? { tenant_id: tenantId } : {},
      relations: ['role'],
    });
  }

  async findTasksByMonth(
    month: string,
    tenantId?: string,
  ): Promise<TaskMaster[]> {
    return this.taskMasterRepository.find({
      where: tenantId ? { month, tenant_id: tenantId } : { month },
      relations: ['role'],
    });
  }

  async findTasksByRole(
    roleId: number,
    tenantId?: string,
  ): Promise<TaskMaster[]> {
    return this.taskMasterRepository.find({
      where: tenantId
        ? { role_id: roleId, tenant_id: tenantId }
        : { role_id: roleId },
      relations: ['role'],
    });
  }

  async findOneTask(id: number, tenantId?: string): Promise<TaskMaster> {
    const task = await this.taskMasterRepository.findOne({
      where: tenantId ? { task_id: id, tenant_id: tenantId } : { task_id: id },
      relations: ['role'],
    });
    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    return task;
  }

  async updateTask(
    id: number,
    updateTaskDto: UpdateTaskDto,
    tenantId?: string,
  ): Promise<TaskMaster> {
    const task = await this.findOneTask(id, tenantId);
    Object.assign(task, updateTaskDto);
    task.version += 1;
    return this.taskMasterRepository.save(task);
  }

  async removeTask(id: number, tenantId?: string): Promise<void> {
    const task = await this.findOneTask(id, tenantId);
    await this.taskMasterRepository.softRemove(task);
  }

  // Task Assignment Operations
  async assignTaskToUser(
    taskId: number,
    userId: string,
    dueDate?: Date,
    scope?: TaskRequestScope,
  ): Promise<TaskAssignment> {
    const task = await this.findOneTask(taskId, scope?.tenantId);
    const user = await this.userRepository.findOne({
      where: scope
        ? { user_id: userId, tenant_id: scope.tenantId }
        : { user_id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const cycleMonth = monthNameToNumber(task.month);
    const cycleYear = dueDate?.getUTCFullYear() ?? new Date().getFullYear();
    const assignment = this.taskAssignmentRepository.create({
      task_id: taskId,
      assigned_to: userId,
      tenant_id: user.tenant_id,
      dept_id: user.dept_id,
      cycle_year: cycleYear,
      cycle_month: cycleMonth,
      due_date:
        dueDate ??
        calculateCycleDueDate(cycleYear, cycleMonth, task.due_date_policy),
      status: 'OPEN',
    });

    return this.taskAssignmentRepository.save(assignment);
  }

  async findUserAssignments(
    userId: string,
    status?: string,
    tenantId?: string,
  ): Promise<any[]> {
    const queryBuilder = this.taskAssignmentRepository
      .createQueryBuilder('assignment')
      .leftJoinAndSelect('assignment.task', 'task')
      .leftJoinAndSelect('task.role', 'role')
      .where('assignment.assigned_to = :userId', { userId });

    if (tenantId) {
      queryBuilder.andWhere('assignment.tenant_id = :tenantId', { tenantId });
    }

    if (status) {
      queryBuilder.andWhere('assignment.status = :status', { status });
    }

    const assignments = await queryBuilder.getMany();

    const assignmentIds = assignments.map((a) => a.assignment_id);
    if (assignmentIds.length === 0) {
      return [];
    }

    const submissions = await this.submissionRepository
      .createQueryBuilder('submission')
      .where('submission.assignment_id IN (:...assignmentIds)', {
        assignmentIds,
      })
      .getMany();

    return assignments.map((assignment) => ({
      ...assignment,
      submissions: submissions.filter(
        (submission) => submission.assignment_id === assignment.assignment_id,
      ),
    }));
  }

  async findAllAssignments(tenantId?: string): Promise<TaskAssignment[]> {
    return this.taskAssignmentRepository.find({
      where: tenantId ? { tenant_id: tenantId } : {},
      relations: [
        'task',
        'task.role',
        'assigned_user',
        'assigned_user.department',
      ],
    });
  }

  async findAllAssignmentsWithSubmissions(tenantId?: string): Promise<any[]> {
    const assignments = await this.findAllAssignments(tenantId);
    const assignmentIds = assignments.map(
      (assignment) => assignment.assignment_id,
    );

    if (assignmentIds.length === 0) {
      return [];
    }

    const submissions = await this.submissionRepository
      .createQueryBuilder('submission')
      .where('submission.assignment_id IN (:...assignmentIds)', {
        assignmentIds,
      })
      .getMany();

    return assignments.map((assignment) => ({
      ...assignment,
      submissions: submissions.filter(
        (submission) => submission.assignment_id === assignment.assignment_id,
      ),
    }));
  }

  async updateAssignmentStatus(
    assignmentId: string,
    status: string,
    scope?: TaskRequestScope,
  ): Promise<TaskAssignment> {
    const assignment = await this.taskAssignmentRepository.findOne({
      where: scope
        ? { assignment_id: assignmentId, tenant_id: scope.tenantId }
        : { assignment_id: assignmentId },
    });

    if (!assignment) {
      throw new NotFoundException(
        `Assignment with ID ${assignmentId} not found`,
      );
    }

    const normalizedStatus = status.toUpperCase();
    if (scope && assignment.assigned_to !== scope.userId) {
      throw new ForbiddenException('You can only change your own assignment');
    }
    if (!['OPEN', 'CANCELLED'].includes(normalizedStatus)) {
      throw new BadRequestException(
        'Evidence and review endpoints control submitted and completed states',
      );
    }
    assignment.status = normalizedStatus;
    if (normalizedStatus === 'CLOSED') {
      assignment.completed_at = new Date();
    }
    assignment.version += 1;

    return this.taskAssignmentRepository.save(assignment);
  }

  // Submission Operations
  async createSubmission(
    assignmentId: string,
    createSubmissionDto: CreateSubmissionDto,
    userId: string,
    tenantId?: string,
  ): Promise<Submission> {
    const assignment = await this.taskAssignmentRepository.findOne({
      where: tenantId
        ? { assignment_id: assignmentId, tenant_id: tenantId }
        : { assignment_id: assignmentId },
    });

    if (!assignment) {
      throw new NotFoundException(
        `Assignment with ID ${assignmentId} not found`,
      );
    }

    if (assignment.assigned_to !== userId) {
      throw new ForbiddenException(
        'You can only submit to your own assignments',
      );
    }

    const geminiConfigured = !!this.configService.get<string>('GEMINI_API_KEY');
    const shouldQueueAi =
      geminiConfigured && submissionIncludesPdf(createSubmissionDto);

    const submission = this.submissionRepository.create({
      assignment_id: assignmentId,
      tenant_id: assignment.tenant_id,
      ...createSubmissionDto,
      ai_status: shouldQueueAi ? AiSubmissionStatus.PENDING : null,
    });

    const savedSubmission = await this.submissionRepository.save(submission);

    if (shouldQueueAi) {
      await this.submissionAiQueue.add(
        'analyze',
        { submissionId: savedSubmission.submission_id },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 8000 },
          removeOnComplete: true,
          removeOnFail: 200,
        },
      );
    }

    assignment.status = 'PENDING_HOD_APPROVAL';
    assignment.submitted_at = new Date();
    assignment.reviewed_at = null;
    assignment.reviewed_by = null;
    assignment.review_comments = null;
    assignment.version += 1;
    await this.taskAssignmentRepository.save(assignment);

    const user = await this.userRepository.findOne({
      where: { user_id: userId },
    });
    await this.enterpriseAudit.log({
      tenantId: user?.tenant_id ?? 'a0000000-0000-4000-8000-000000000001',
      userId,
      module: 'governance_tasks',
      action: 'GOVERNANCE_SUBMISSION',
      recordId: savedSubmission.submission_id,
      newValue: {
        assignment_id: assignmentId,
        file_name: savedSubmission.file_name ?? null,
      },
    });

    return savedSubmission;
  }

  /**
   * IQAC/HR: re-queue Gemini analysis (e.g. after key rotation, model change, or transient API failure).
   */
  async retrySubmissionAiAnalysis(submissionId: string): Promise<Submission> {
    if (!this.configService.get<string>('GEMINI_API_KEY')) {
      throw new BadRequestException(
        'GEMINI_API_KEY is not configured; cannot run AI analysis.',
      );
    }

    const submission = await this.submissionRepository.findOne({
      where: { submission_id: submissionId },
    });

    if (!submission) {
      throw new NotFoundException(
        `Submission with ID ${submissionId} not found`,
      );
    }

    if (!recordIncludesPdf(submission.file_path, submission.file_type)) {
      throw new BadRequestException(
        'This submission has no PDF; AI validation only runs on PDF uploads.',
      );
    }

    submission.ai_status = AiSubmissionStatus.PENDING;
    submission.ai_extracted_data = null;
    submission.ai_remarks = null;
    const saved = await this.submissionRepository.save(submission);

    await this.submissionAiQueue.add(
      'analyze',
      { submissionId: saved.submission_id },
      {
        jobId: `ai-retry-${saved.submission_id}-${Date.now()}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 8000 },
        removeOnComplete: true,
        removeOnFail: 200,
      },
    );

    return saved;
  }

  async findSubmissionsByAssignment(
    assignmentId: string,
    tenantId?: string,
  ): Promise<Submission[]> {
    return this.submissionRepository.find({
      where: tenantId
        ? { assignment_id: assignmentId, tenant_id: tenantId }
        : { assignment_id: assignmentId },
    });
  }

  async findSubmissionsByUser(
    userId: string,
    tenantId?: string,
  ): Promise<Submission[]> {
    const assignments = await this.taskAssignmentRepository.find({
      where: tenantId
        ? { assigned_to: userId, tenant_id: tenantId }
        : { assigned_to: userId },
    });

    const assignmentIds = assignments.map((a) => a.assignment_id);
    if (assignmentIds.length === 0) {
      return [];
    }

    return this.submissionRepository.find({
      where: { assignment_id: In(assignmentIds) },
      relations: ['assignment', 'assignment.task'],
    });
  }

  // Bulk Operations for Task Distribution
  async distributeTasksForMonth(
    month: string,
    year = new Date().getFullYear(),
    tenantId?: string,
  ): Promise<TaskAssignment[]> {
    const tasks = await this.findTasksByMonth(month, tenantId);
    const assignments: TaskAssignment[] = [];

    for (const task of tasks) {
      if (!task.role_id && !task.default_assignee_id) {
        continue;
      }
      const users = task.default_assignee_id
        ? await this.userRepository.find({
            where: {
              user_id: task.default_assignee_id,
              is_active: true,
              ...(task.tenant_id ? { tenant_id: task.tenant_id } : {}),
            },
          })
        : await this.userRepository.find({
            where: {
              role_id: task.role_id!,
              is_active: true,
              ...(task.tenant_id ? { tenant_id: task.tenant_id } : {}),
              ...(task.dept_id ? { dept_id: task.dept_id } : {}),
            },
          });

      for (const user of users) {
        // Check if assignment already exists for this user and task this month
        const existing = await this.taskAssignmentRepository.findOne({
          where: {
            task_id: task.task_id,
            assigned_to: user.user_id,
            tenant_id: user.tenant_id,
            cycle_year: year,
            cycle_month: monthNameToNumber(month),
          },
        });

        if (!existing) {
          const cycleMonth = monthNameToNumber(month);
          const dueDate = calculateCycleDueDate(
            year,
            cycleMonth,
            task.due_date_policy,
          );
          const assignment = this.taskAssignmentRepository.create({
            task_id: task.task_id,
            assigned_to: user.user_id,
            tenant_id: user.tenant_id,
            dept_id: user.dept_id,
            cycle_year: year,
            cycle_month: cycleMonth,
            due_date: dueDate,
            status: 'OPEN',
          });
          assignments.push(assignment);
        }
      }
    }

    return this.taskAssignmentRepository.save(assignments);
  }

  async reviewAssignment(
    assignmentId: string,
    decision: (typeof REVIEW_DECISIONS)[number],
    comments: string | undefined,
    scope: TaskRequestScope,
  ): Promise<TaskAssignment> {
    if (!REVIEW_DECISIONS.includes(decision)) {
      throw new BadRequestException('Invalid review decision');
    }
    if (decision === 'CHANGES_REQUESTED' && !comments?.trim()) {
      throw new BadRequestException(
        'Reviewer comments are required when requesting changes',
      );
    }
    const assignment = await this.taskAssignmentRepository.findOne({
      where: { assignment_id: assignmentId, tenant_id: scope.tenantId },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    if (assignment.assigned_to === scope.userId) {
      throw new ForbiddenException(
        'Submitter cannot review their own evidence',
      );
    }
    if (!['PENDING_IQAC_REVIEW', 'UNDER_REVIEW'].includes(assignment.status)) {
      throw new BadRequestException('Assignment is not awaiting review');
    }
    assignment.status = decision;
    assignment.reviewed_at = new Date();
    assignment.reviewed_by = scope.userId;
    assignment.review_comments = comments?.trim() || null;
    assignment.completed_at =
      decision === 'ACCEPTED' || decision === 'WAIVED' ? new Date() : null;
    assignment.version += 1;
    return this.taskAssignmentRepository.save(assignment);
  }

  async findHodReviewQueue(scope: TaskRequestScope): Promise<any[]> {
    const unrestricted = (scope.roles ?? []).some(
      (role) => role.toLowerCase() === 'superadmin',
    );
    if (!unrestricted && !scope.deptId) {
      throw new ForbiddenException('HOD department scope is required');
    }
    const query = this.taskAssignmentRepository
      .createQueryBuilder('assignment')
      .leftJoinAndSelect('assignment.task', 'task')
      .leftJoinAndSelect('assignment.assigned_user', 'assigned_user')
      .where('assignment.tenant_id = :tenantId', {
        tenantId: scope.tenantId,
      })
      .andWhere('assignment.status = :status', {
        status: 'PENDING_HOD_APPROVAL',
      });
    if (!unrestricted) {
      query.andWhere('assignment.dept_id = :deptId', {
        deptId: scope.deptId,
      });
    }
    const assignments = await query
      .orderBy('assignment.submitted_at', 'ASC')
      .getMany();
    const ids = assignments.map((item) => item.assignment_id);
    if (!ids.length) return [];
    const submissions = await this.submissionRepository.find({
      where: { assignment_id: In(ids) },
    });
    return assignments.map((assignment) => ({
      ...assignment,
      submissions: submissions.filter(
        (submission) => submission.assignment_id === assignment.assignment_id,
      ),
    }));
  }

  async reviewAssignmentByHod(
    assignmentId: string,
    decision: 'APPROVED' | 'CHANGES_REQUESTED',
    comments: string | undefined,
    scope: TaskRequestScope,
  ): Promise<TaskAssignment> {
    if (!['APPROVED', 'CHANGES_REQUESTED'].includes(decision)) {
      throw new BadRequestException('Invalid HOD review decision');
    }
    if (decision === 'CHANGES_REQUESTED' && !comments?.trim()) {
      throw new BadRequestException(
        'Comments are required when requesting changes',
      );
    }
    const assignment = await this.taskAssignmentRepository.findOne({
      where: { assignment_id: assignmentId, tenant_id: scope.tenantId },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    const unrestricted = (scope.roles ?? []).some(
      (role) => role.toLowerCase() === 'superadmin',
    );
    if (!unrestricted && assignment.dept_id !== scope.deptId) {
      throw new ForbiddenException(
        'HOD may review IQAC submissions only for their own department',
      );
    }
    if (assignment.assigned_to === scope.userId) {
      throw new ForbiddenException(
        'Submitter cannot approve their own evidence',
      );
    }
    if (assignment.status !== 'PENDING_HOD_APPROVAL') {
      throw new BadRequestException('Assignment is not awaiting HOD review');
    }
    assignment.status =
      decision === 'APPROVED' ? 'PENDING_IQAC_REVIEW' : 'CHANGES_REQUESTED';
    assignment.hod_reviewed_at = new Date();
    assignment.hod_reviewed_by = scope.userId;
    assignment.hod_review_comments = comments?.trim() || null;
    assignment.reviewed_at = null;
    assignment.reviewed_by = null;
    assignment.review_comments = null;
    assignment.completed_at = null;
    assignment.version += 1;
    return this.taskAssignmentRepository.save(assignment);
  }

  async markOverdue(now = new Date(), tenantId?: string): Promise<number> {
    const query = this.taskAssignmentRepository
      .createQueryBuilder()
      .update(TaskAssignment)
      .set({ status: 'OVERDUE', version: () => 'version + 1' })
      .where("status IN ('OPEN', 'PENDING', 'CHANGES_REQUESTED')")
      .andWhere('due_date < :now', { now });
    if (tenantId) query.andWhere('tenant_id = :tenantId', { tenantId });
    const result = await query.execute();
    return result.affected ?? 0;
  }

  private currentAcademicYear(date = new Date()): string {
    const start =
      date.getMonth() >= 6 ? date.getFullYear() : date.getFullYear() - 1;
    return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
  }

  // Statistics
  async getCompletionStatistics(
    month: string,
    tenantId?: string,
  ): Promise<any> {
    const tasks = await this.findTasksByMonth(month, tenantId);
    const stats = {
      total: 0,
      completed: 0,
      pending: 0,
      overdue: 0,
      byRole: {} as any,
    };

    for (const task of tasks) {
      const assignments = await this.taskAssignmentRepository.find({
        where: { task_id: task.task_id },
        relations: ['task', 'task.role'],
      });

      stats.total += assignments.length;
      stats.completed += assignments.filter((a) =>
        ['ACCEPTED', 'CLOSED', 'WAIVED'].includes(a.status),
      ).length;
      stats.pending += assignments.filter((a) =>
        [
          'OPEN',
          'PENDING',
          'SUBMITTED',
          'PENDING_HOD_APPROVAL',
          'PENDING_IQAC_REVIEW',
          'UNDER_REVIEW',
          'CHANGES_REQUESTED',
        ].includes(a.status),
      ).length;
      stats.overdue += assignments.filter((a) => a.status === 'OVERDUE').length;

      const roleName = task.role?.role_name || 'Unknown';
      if (!stats.byRole[roleName]) {
        stats.byRole[roleName] = { total: 0, completed: 0, pending: 0 };
      }
      stats.byRole[roleName].total += assignments.length;
      stats.byRole[roleName].completed += assignments.filter((a) =>
        ['ACCEPTED', 'CLOSED', 'WAIVED'].includes(a.status),
      ).length;
      stats.byRole[roleName].pending += assignments.filter((a) =>
        [
          'OPEN',
          'PENDING',
          'SUBMITTED',
          'PENDING_HOD_APPROVAL',
          'PENDING_IQAC_REVIEW',
          'UNDER_REVIEW',
          'CHANGES_REQUESTED',
        ].includes(a.status),
      ).length;
    }

    return stats;
  }
}
