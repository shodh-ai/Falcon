import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
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

function submissionIncludesPdf(dto: CreateSubmissionDto): boolean {
  return recordIncludesPdf(dto.file_path ?? null, dto.file_type ?? null);
}

function recordIncludesPdf(filePath?: string | null, fileType?: string | null): boolean {
  if (!filePath?.trim()) return false;
  const types = (fileType || '').toLowerCase();
  if (types.includes('pdf')) return true;
  return filePath.split(',').some((p) => p.trim().toLowerCase().endsWith('.pdf'));
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
  ) {}

  // Task Master CRUD Operations
  async createTask(createTaskDto: CreateTaskDto): Promise<TaskMaster> {
    const task = this.taskMasterRepository.create(createTaskDto);
    return this.taskMasterRepository.save(task);
  }

  async findAllTasks(): Promise<TaskMaster[]> {
    return this.taskMasterRepository.find({ relations: ['role'] });
  }

  async findTasksByMonth(month: string): Promise<TaskMaster[]> {
    return this.taskMasterRepository.find({
      where: { month },
      relations: ['role'],
    });
  }

  async findTasksByRole(roleId: number): Promise<TaskMaster[]> {
    return this.taskMasterRepository.find({
      where: { role_id: roleId },
      relations: ['role'],
    });
  }

  async findOneTask(id: number): Promise<TaskMaster> {
    const task = await this.taskMasterRepository.findOne({
      where: { task_id: id },
      relations: ['role'],
    });
    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    return task;
  }

  async updateTask(id: number, updateTaskDto: UpdateTaskDto): Promise<TaskMaster> {
    const task = await this.findOneTask(id);
    Object.assign(task, updateTaskDto);
    return this.taskMasterRepository.save(task);
  }

  async removeTask(id: number): Promise<void> {
    const task = await this.findOneTask(id);
    await this.taskMasterRepository.remove(task);
  }

  // Task Assignment Operations
  async assignTaskToUser(taskId: number, userId: string, dueDate?: Date): Promise<TaskAssignment> {
    const task = await this.findOneTask(taskId);
    const user = await this.userRepository.findOne({ where: { user_id: userId } });
    
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const assignment = this.taskAssignmentRepository.create({
      task_id: taskId,
      assigned_to: userId,
      due_date: dueDate,
      status: 'Pending',
    });

    return this.taskAssignmentRepository.save(assignment);
  }

  async findUserAssignments(userId: string, status?: string): Promise<TaskAssignment[]> {
    const queryBuilder = this.taskAssignmentRepository
      .createQueryBuilder('assignment')
      .leftJoinAndSelect('assignment.task', 'task')
      .leftJoinAndSelect('task.role', 'role')
      .where('assignment.assigned_to = :userId', { userId });

    if (status) {
      queryBuilder.andWhere('assignment.status = :status', { status });
    }

    return queryBuilder.getMany();
  }

  async findAllAssignments(): Promise<TaskAssignment[]> {
    return this.taskAssignmentRepository.find({
      relations: ['task', 'task.role', 'assigned_user', 'assigned_user.department'],
    });
  }

  async findAllAssignmentsWithSubmissions(): Promise<any[]> {
    const assignments = await this.findAllAssignments();
    const assignmentIds = assignments.map(assignment => assignment.assignment_id);

    if (assignmentIds.length === 0) {
      return [];
    }

    const submissions = await this.submissionRepository
      .createQueryBuilder('submission')
      .where('submission.assignment_id IN (:...assignmentIds)', { assignmentIds })
      .getMany();

    return assignments.map(assignment => ({
      ...assignment,
      submissions: submissions.filter(submission => submission.assignment_id === assignment.assignment_id),
    }));
  }

  async updateAssignmentStatus(assignmentId: string, status: string): Promise<TaskAssignment> {
    const assignment = await this.taskAssignmentRepository.findOne({
      where: { assignment_id: assignmentId },
    });

    if (!assignment) {
      throw new NotFoundException(`Assignment with ID ${assignmentId} not found`);
    }

    assignment.status = status;
    if (status === 'Completed') {
      assignment.completed_at = new Date();
    }

    return this.taskAssignmentRepository.save(assignment);
  }

  // Submission Operations
  async createSubmission(
    assignmentId: string,
    createSubmissionDto: CreateSubmissionDto,
    userId: string,
  ): Promise<Submission> {
    const assignment = await this.taskAssignmentRepository.findOne({
      where: { assignment_id: assignmentId },
    });

    if (!assignment) {
      throw new NotFoundException(`Assignment with ID ${assignmentId} not found`);
    }

    if (assignment.assigned_to !== userId) {
      throw new ForbiddenException('You can only submit to your own assignments');
    }

    const geminiConfigured = !!this.configService.get<string>('GEMINI_API_KEY');
    const shouldQueueAi = geminiConfigured && submissionIncludesPdf(createSubmissionDto);

    const submission = this.submissionRepository.create({
      assignment_id: assignmentId,
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

    // Update assignment status to Completed
    await this.updateAssignmentStatus(assignmentId, 'Completed');

    return savedSubmission;
  }

  /**
   * IQAC/HR: re-queue Gemini analysis (e.g. after key rotation, model change, or transient API failure).
   */
  async retrySubmissionAiAnalysis(submissionId: string): Promise<Submission> {
    if (!this.configService.get<string>('GEMINI_API_KEY')) {
      throw new BadRequestException('GEMINI_API_KEY is not configured; cannot run AI analysis.');
    }

    const submission = await this.submissionRepository.findOne({
      where: { submission_id: submissionId },
    });

    if (!submission) {
      throw new NotFoundException(`Submission with ID ${submissionId} not found`);
    }

    if (!recordIncludesPdf(submission.file_path, submission.file_type)) {
      throw new BadRequestException('This submission has no PDF; AI validation only runs on PDF uploads.');
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

  async findSubmissionsByAssignment(assignmentId: string): Promise<Submission[]> {
    return this.submissionRepository.find({
      where: { assignment_id: assignmentId },
    });
  }

  async findSubmissionsByUser(userId: string): Promise<Submission[]> {
    const assignments = await this.taskAssignmentRepository.find({
      where: { assigned_to: userId },
    });

    const assignmentIds = assignments.map(a => a.assignment_id);
    if (assignmentIds.length === 0) {
      return [];
    }

    return this.submissionRepository.find({
      where: { assignment_id: In(assignmentIds) },
      relations: ['assignment'],
    });
  }

  // Bulk Operations for Task Distribution
  async distributeTasksForMonth(month: string): Promise<TaskAssignment[]> {
    const tasks = await this.findTasksByMonth(month);
    const assignments: TaskAssignment[] = [];

    for (const task of tasks) {
      if (!task.role_id) {
        continue;
      }
      const users = await this.userRepository.find({
        where: { role_id: task.role_id, is_active: true },
      });

      for (const user of users) {
        // Check if assignment already exists for this user and task this month
        const existing = await this.taskAssignmentRepository.findOne({
          where: {
            task_id: task.task_id,
            assigned_to: user.user_id,
          },
        });

        if (!existing) {
          const dueDate = this.calculateDueDate(month);
          const assignment = this.taskAssignmentRepository.create({
            task_id: task.task_id,
            assigned_to: user.user_id,
            due_date: dueDate,
            status: 'Pending',
          });
          assignments.push(assignment);
        }
      }
    }

    return this.taskAssignmentRepository.save(assignments);
  }

  private calculateDueDate(month: string): Date {
    const monthMap: { [key: string]: number } = {
      January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
      July: 6, August: 7, September: 8, October: 9, November: 10, December: 11,
    };

    const currentYear = new Date().getFullYear();
    const monthIndex = monthMap[month] || 0;
    const dueDate = new Date(currentYear, monthIndex, 25); // Due on 25th of the month

    return dueDate;
  }

  // Statistics
  async getCompletionStatistics(month: string): Promise<any> {
    const tasks = await this.findTasksByMonth(month);
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
      stats.completed += assignments.filter(a => a.status === 'Completed').length;
      stats.pending += assignments.filter(a => a.status === 'Pending').length;
      stats.overdue += assignments.filter(a => a.status === 'Overdue').length;

      const roleName = task.role?.role_name || 'Unknown';
      if (!stats.byRole[roleName]) {
        stats.byRole[roleName] = { total: 0, completed: 0, pending: 0 };
      }
      stats.byRole[roleName].total += assignments.length;
      stats.byRole[roleName].completed += assignments.filter(a => a.status === 'Completed').length;
      stats.byRole[roleName].pending += assignments.filter(a => a.status === 'Pending').length;
    }

    return stats;
  }
}
