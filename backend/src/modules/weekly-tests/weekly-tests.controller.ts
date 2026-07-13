import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Patch,
  Req,
  UseGuards,
  Delete,
} from '@nestjs/common';
import { WeeklyTestsService } from './weekly-tests.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

type AuthUser = { user_id: string; tenant_id?: string };

@Controller('api/weekly-tests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WeeklyTestsController {
  constructor(private readonly testsService: WeeklyTestsService) {}

  @Post('faculty/create')
  @Roles('Faculty', 'HOD', 'Dean', 'Admin')
  createTest(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      course_id: string;
      test_type: 'WT1' | 'WT2';
      question_paper_url: string;
      answer_key: string[];
      start_time: string;
      end_time: string;
    },
  ) {
    return this.testsService.createTest(
      this.tenant(req),
      req.user.user_id,
      body,
    );
  }

  @Get('faculty')
  @Roles('Faculty', 'HOD', 'Dean', 'Admin')
  getFacultyTests(@Req() req: { user: AuthUser }) {
    return this.testsService.getFacultyTests(
      this.tenant(req),
      req.user.user_id,
    );
  }

  @Delete('faculty/:testId')
  @Roles('Faculty', 'HOD', 'Dean', 'Admin')
  deleteTest(@Req() req: { user: AuthUser }, @Param('testId') testId: string) {
    return this.testsService.deleteTest(
      this.tenant(req),
      req.user.user_id,
      testId,
    );
  }

  @Patch('faculty/:testId/toggle')
  @Roles('Faculty', 'HOD', 'Dean', 'Admin')
  toggleTestStatus(
    @Req() req: { user: AuthUser },
    @Param('testId') testId: string,
    @Body() body: { is_active: boolean },
  ) {
    return this.testsService.toggleTestStatus(
      this.tenant(req),
      req.user.user_id,
      testId,
      body.is_active,
    );
  }

  @Get('student/available')
  @Roles('Student')
  getAvailableTests(@Req() req: { user: AuthUser }) {
    return this.testsService.getAvailableTests(
      this.tenant(req),
      req.user.user_id,
    );
  }

  @Get('student/:testId')
  @Roles('Student')
  getTestForAttempt(
    @Req() req: { user: AuthUser },
    @Param('testId') testId: string,
  ) {
    return this.testsService.getTestForAttempt(
      this.tenant(req),
      req.user.user_id,
      testId,
    );
  }

  @Post('student/:testId/submit')
  @Roles('Student')
  submitTest(
    @Req() req: { user: AuthUser },
    @Param('testId') testId: string,
    @Body() body: { answers: string[]; violation_count: number },
  ) {
    return this.testsService.submitTest(
      this.tenant(req),
      req.user.user_id,
      testId,
      body,
    );
  }

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }
}
