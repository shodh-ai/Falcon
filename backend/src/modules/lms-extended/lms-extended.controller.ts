import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { LmsExtendedService } from './lms-extended.service';
import { CreateLiveClassDto } from './dto/create-live-class.dto';
import { CreateForumThreadDto } from './dto/create-forum-thread.dto';
import { CreateForumReplyDto } from './dto/create-forum-reply.dto';

type AuthUser = {
  user_id: string;
  tenant_id?: string;
  role?: string;
  roles?: string[];
};

@Controller('api/lms')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LmsExtendedController {
  constructor(private readonly lms: LmsExtendedService) {}

  @Post('quizzes')
  @Roles('Faculty', 'SuperAdmin')
  createQuiz(
    @Req() req: { user: AuthUser },
    @Body() dto: Record<string, unknown>,
  ) {
    return this.lms.createQuiz(
      this.tenant(req),
      req.user.user_id,
      dto as never,
    );
  }

  @Get('courses/:courseId/quizzes')
  @Roles('Faculty', 'Student', 'SuperAdmin')
  listQuizzes(@Param('courseId') courseId: string) {
    return this.lms.listCourseQuizzes(courseId);
  }

  @Post('quizzes/:quizId/attempts')
  @Roles('Student')
  startAttempt(
    @Req() req: { user: AuthUser },
    @Param('quizId') quizId: string,
  ) {
    return this.lms.startAttempt(quizId, req.user.user_id);
  }

  @Post('attempts/:attemptId/submit')
  @Roles('Student')
  submitAttempt(
    @Req() req: { user: AuthUser },
    @Param('attemptId') attemptId: string,
    @Body()
    dto: {
      answers: Array<{
        question_id: string;
        selected_option_id?: string;
        descriptive_answer?: string;
      }>;
      anti_cheat_events?: unknown[];
    },
  ) {
    return this.lms.submitAttempt(
      attemptId,
      req.user.user_id,
      dto.answers,
      dto.anti_cheat_events,
    );
  }

  @Post('live-classes')
  @Roles('Faculty', 'SuperAdmin')
  createLive(@Req() req: { user: AuthUser }, @Body() dto: CreateLiveClassDto) {
    return this.lms.createLiveClass(this.tenant(req), req.user.user_id, dto);
  }

  @Get('courses/:courseId/live-classes')
  @Roles('Faculty', 'Student', 'SuperAdmin', 'HOD', 'Dean')
  listLive(
    @Param('courseId') courseId: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.lms.listLiveClasses(
      courseId,
      this.tenant(req),
      req.user.user_id,
      this.roles(req),
    );
  }

  @Get('live-classes/updates')
  @Roles('Student')
  studentLiveUpdates(@Req() req: { user: AuthUser }) {
    return this.lms.listStudentLiveClassUpdates(
      req.user.user_id,
      this.tenant(req),
    );
  }

  @Get('live-classes/active')
  @Roles('Student')
  activeLive(@Req() req: { user: AuthUser }) {
    return this.lms.listActiveLiveClasses(req.user.user_id, this.tenant(req));
  }

  @Post('forums/threads')
  @Roles('Faculty', 'Student', 'SuperAdmin')
  createThread(
    @Req() req: { user: AuthUser },
    @Body() dto: CreateForumThreadDto,
  ) {
    return this.lms.createThread(this.tenant(req), req.user.user_id, dto);
  }

  @Get('courses/:courseId/forums')
  @Roles('Faculty', 'Student', 'SuperAdmin')
  listThreads(@Param('courseId') courseId: string) {
    return this.lms.listThreads(courseId);
  }

  @Post('forums/threads/:threadId/replies')
  @Roles('Faculty', 'Student', 'SuperAdmin')
  reply(
    @Req() req: { user: AuthUser },
    @Param('threadId') threadId: string,
    @Body() dto: CreateForumReplyDto,
  ) {
    return this.lms.replyToThread(threadId, req.user.user_id, dto.body);
  }

  @Post('forums/upvote')
  @Roles('Faculty', 'Student', 'SuperAdmin')
  upvote(
    @Req() req: { user: AuthUser },
    @Body() dto: { target_type: 'THREAD' | 'POST'; target_id: string },
  ) {
    return this.lms.upvote(req.user.user_id, dto.target_type, dto.target_id);
  }

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  private roles(req: { user: AuthUser }) {
    return req.user.roles?.length
      ? req.user.roles
      : req.user.role
        ? [req.user.role]
        : [];
  }
}
