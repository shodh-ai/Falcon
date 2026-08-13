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

@Controller('tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  // Task Master Endpoints
  @Post()
  @Roles('IQAC', 'HR')
  createTask(@Body() createTaskDto: CreateTaskDto) {
    return this.tasksService.createTask(createTaskDto);
  }

  @Get()
  @Roles('IQAC', 'HR', 'President', 'SuperAdmin', 'Dean')
  findAllTasks() {
    return this.tasksService.findAllTasks();
  }

  @Get('month/:month')
  @Roles('IQAC', 'HR', 'President', 'SuperAdmin', 'Dean')
  findTasksByMonth(@Param('month') month: string) {
    return this.tasksService.findTasksByMonth(month);
  }

  @Get('role/:roleId')
  @Roles('IQAC', 'HR', 'President', 'SuperAdmin', 'Dean')
  findTasksByRole(@Param('roleId') roleId: string) {
    return this.tasksService.findTasksByRole(parseInt(roleId));
  }

  @Get('assignments/all')
  @Roles('IQAC', 'HR', 'President')
  findAllAssignments() {
    return this.tasksService.findAllAssignmentsWithSubmissions();
  }

  // Task Assignment Endpoints
  @Post('assign/:taskId/:userId')
  @Roles('IQAC', 'HR')
  assignTaskToUser(
    @Param('taskId') taskId: string,
    @Param('userId') userId: string,
    @Body('dueDate') dueDate?: string,
  ) {
    const dueDateObj = dueDate ? new Date(dueDate) : undefined;
    return this.tasksService.assignTaskToUser(
      parseInt(taskId),
      userId,
      dueDateObj,
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
  getMyAssignments(@Req() req: any, @Query('status') status?: string) {
    return this.tasksService.findUserAssignments(req.user.user_id, status);
  }

  @Get('assignments/user/:userId')
  @Roles('IQAC', 'HR', 'Dean')
  getUserAssignments(
    @Param('userId') userId: string,
    @Query('status') status?: string,
  ) {
    return this.tasksService.findUserAssignments(userId, status);
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
  ) {
    return this.tasksService.updateAssignmentStatus(assignmentId, status);
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
    );
  }

  @Get('submissions/assignment/:assignmentId')
  @Roles('IQAC', 'HR', 'President', 'SuperAdmin', 'Dean')
  findSubmissionsByAssignment(@Param('assignmentId') assignmentId: string) {
    return this.tasksService.findSubmissionsByAssignment(assignmentId);
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
  getMySubmissions(@Req() req: any) {
    return this.tasksService.findSubmissionsByUser(req.user.user_id);
  }

  // Bulk Operations
  @Post('distribute/:month')
  @Roles('IQAC', 'HR')
  distributeTasksForMonth(@Param('month') month: string) {
    return this.tasksService.distributeTasksForMonth(month);
  }

  // Statistics
  @Get('stats/:month')
  @Roles('IQAC', 'HR', 'President', 'Dean')
  getCompletionStatistics(@Param('month') month: string) {
    return this.tasksService.getCompletionStatistics(month);
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
  findOneTask(@Param('id') id: string) {
    return this.tasksService.findOneTask(parseInt(id));
  }

  @Put(':id')
  @Roles('IQAC', 'HR')
  updateTask(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto) {
    return this.tasksService.updateTask(parseInt(id), updateTaskDto);
  }

  @Delete(':id')
  @Roles('IQAC', 'HR')
  removeTask(@Param('id') id: string) {
    return this.tasksService.removeTask(parseInt(id));
  }
}
