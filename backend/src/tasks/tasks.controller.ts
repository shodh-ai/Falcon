import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

type AuthRequest = {
  user: {
    user_id: string;
    tenant_id?: string;
    dept_id?: number | null;
    role?: string;
    roles?: string[];
  };
};

const DEFAULT_TENANT_ID = 'a0000000-0000-4000-8000-000000000001';

@Controller('tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  // Task Master Endpoints
  @Post()
  @Roles('IQAC', 'HR')
  createTask(@Body() createTaskDto: CreateTaskDto, @Req() req: AuthRequest) {
    return this.tasksService.createTask(createTaskDto, this.scope(req));
  }

  @Get()
  @Roles('IQAC', 'HR', 'President', 'SuperAdmin', 'Dean')
  findAllTasks(@Req() req: AuthRequest) {
    return this.tasksService.findAllTasks(this.tenant(req));
  }

  @Get('month/:month')
  @Roles('IQAC', 'HR', 'President', 'SuperAdmin', 'Dean')
  findTasksByMonth(@Param('month') month: string, @Req() req: AuthRequest) {
    return this.tasksService.findTasksByMonth(month, this.tenant(req));
  }

  @Get('role/:roleId')
  @Roles('IQAC', 'HR', 'President', 'SuperAdmin', 'Dean')
  findTasksByRole(@Param('roleId') roleId: string, @Req() req: AuthRequest) {
    return this.tasksService.findTasksByRole(
      parseInt(roleId),
      this.tenant(req),
    );
  }

  @Get('assignments/all')
  @Roles('IQAC', 'HR', 'President')
  findAllAssignments(@Req() req: AuthRequest) {
    return this.tasksService.findAllAssignmentsWithSubmissions(
      this.tenant(req),
    );
  }

  // Task Assignment Endpoints
  @Post('assign/:taskId/:userId')
  @Roles('IQAC', 'HR')
  assignTaskToUser(
    @Param('taskId') taskId: string,
    @Param('userId') userId: string,
    @Body('dueDate') dueDate?: string,
    @Req() req?: AuthRequest,
  ) {
    const dueDateObj = dueDate ? new Date(dueDate) : undefined;
    return this.tasksService.assignTaskToUser(
      parseInt(taskId),
      userId,
      dueDateObj,
      req ? this.scope(req) : undefined,
    );
  }

  @Get('assignments/my')
  @Roles(
    'Faculty',
    'HOD',
    'Dean',
    'SuperAdmin',
    'IQAC',
    'HR',
    'President',
    'Admin',
    'Registrar',
  )
  getMyAssignments(@Req() req: AuthRequest, @Query('status') status?: string) {
    return this.tasksService.findUserAssignments(
      req.user.user_id,
      status,
      this.tenant(req),
    );
  }

  @Get('assignments/user/:userId')
  @Roles('IQAC', 'HR', 'Dean')
  getUserAssignments(
    @Param('userId') userId: string,
    @Query('status') status?: string,
    @Req() req?: AuthRequest,
  ) {
    return this.tasksService.findUserAssignments(
      userId,
      status,
      req ? this.tenant(req) : undefined,
    );
  }

  @Put('assignments/:assignmentId/status')
  @Roles(
    'Faculty',
    'HOD',
    'Dean',
    'SuperAdmin',
    'IQAC',
    'HR',
    'President',
    'Admin',
    'Registrar',
  )
  updateAssignmentStatus(
    @Param('assignmentId') assignmentId: string,
    @Body('status') status: string,
    @Req() req: AuthRequest,
  ) {
    return this.tasksService.updateAssignmentStatus(
      assignmentId,
      status,
      this.scope(req),
    );
  }

  @Post('assignments/:assignmentId/review')
  @Roles('IQAC', 'SuperAdmin')
  reviewAssignment(
    @Param('assignmentId') assignmentId: string,
    @Body()
    body: {
      decision: 'ACCEPTED' | 'CHANGES_REQUESTED' | 'WAIVED';
      comments?: string;
    },
    @Req() req: AuthRequest,
  ) {
    return this.tasksService.reviewAssignment(
      assignmentId,
      body.decision,
      body.comments,
      this.scope(req),
    );
  }

  @Get('assignments/hod-review')
  @Roles('HOD', 'SuperAdmin')
  getHodReviewQueue(@Req() req: AuthRequest) {
    return this.tasksService.findHodReviewQueue(this.scope(req));
  }

  @Post('assignments/:assignmentId/hod-review')
  @Roles('HOD', 'SuperAdmin')
  hodReviewAssignment(
    @Param('assignmentId') assignmentId: string,
    @Body()
    body: {
      decision: 'APPROVED' | 'CHANGES_REQUESTED';
      comments?: string;
    },
    @Req() req: AuthRequest,
  ) {
    return this.tasksService.reviewAssignmentByHod(
      assignmentId,
      body.decision,
      body.comments,
      this.scope(req),
    );
  }

  // Submission Endpoints (specific routes before generic :assignmentId)
  @Post('submissions/:submissionId/retry-ai')
  @Roles('IQAC', 'HR')
  retrySubmissionAi(@Param('submissionId') submissionId: string) {
    return this.tasksService.retrySubmissionAiAnalysis(submissionId);
  }

  @Post('submissions/:assignmentId')
  @Roles(
    'Faculty',
    'HOD',
    'Dean',
    'SuperAdmin',
    'IQAC',
    'HR',
    'President',
    'Admin',
    'Registrar',
  )
  createSubmission(
    @Param('assignmentId') assignmentId: string,
    @Body() createSubmissionDto: CreateSubmissionDto,
    @Req() req: any,
  ) {
    return this.tasksService.createSubmission(
      assignmentId,
      createSubmissionDto,
      req.user.user_id,
      this.tenant(req),
    );
  }

  @Get('submissions/assignment/:assignmentId')
  @Roles('IQAC', 'HR', 'President', 'SuperAdmin', 'Dean')
  findSubmissionsByAssignment(
    @Param('assignmentId') assignmentId: string,
    @Req() req: AuthRequest,
  ) {
    return this.tasksService.findSubmissionsByAssignment(
      assignmentId,
      this.tenant(req),
    );
  }

  @Get('submissions/my')
  @Roles(
    'Faculty',
    'HOD',
    'Dean',
    'SuperAdmin',
    'IQAC',
    'HR',
    'President',
    'Admin',
    'Registrar',
  )
  getMySubmissions(@Req() req: AuthRequest) {
    return this.tasksService.findSubmissionsByUser(
      req.user.user_id,
      this.tenant(req),
    );
  }

  // Bulk Operations
  @Post('distribute/:month')
  @Roles('IQAC', 'HR')
  distributeTasksForMonth(
    @Param('month') month: string,
    @Query('year') year: string | undefined,
    @Req() req: AuthRequest,
  ) {
    return this.tasksService.distributeTasksForMonth(
      month,
      year ? Number(year) : new Date().getFullYear(),
      this.tenant(req),
    );
  }

  // Statistics
  @Get('stats/:month')
  @Roles('IQAC', 'HR', 'President', 'Dean')
  getCompletionStatistics(
    @Param('month') month: string,
    @Req() req: AuthRequest,
  ) {
    return this.tasksService.getCompletionStatistics(month, this.tenant(req));
  }

  @Get(':id')
  @Roles(
    'Faculty',
    'HOD',
    'Dean',
    'SuperAdmin',
    'IQAC',
    'HR',
    'President',
    'Admin',
    'Registrar',
  )
  findOneTask(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.tasksService.findOneTask(parseInt(id), this.tenant(req));
  }

  @Put(':id')
  @Roles('IQAC', 'HR')
  updateTask(
    @Param('id') id: string,
    @Body() updateTaskDto: UpdateTaskDto,
    @Req() req: AuthRequest,
  ) {
    return this.tasksService.updateTask(
      parseInt(id),
      updateTaskDto,
      this.tenant(req),
    );
  }

  @Delete(':id')
  @Roles('IQAC', 'HR')
  removeTask(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.tasksService.removeTask(parseInt(id), this.tenant(req));
  }

  private tenant(req: AuthRequest): string {
    return req.user.tenant_id ?? DEFAULT_TENANT_ID;
  }

  private scope(req: AuthRequest) {
    return {
      userId: req.user.user_id,
      tenantId: this.tenant(req),
      deptId: req.user.dept_id,
      roles: [...(req.user.roles ?? []), req.user.role ?? ''].filter(Boolean),
    };
  }
}
