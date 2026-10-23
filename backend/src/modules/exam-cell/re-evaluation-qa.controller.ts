import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsInt, Min } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SubmitReEvaluationReportDto } from './dto/re-evaluations.dto';
import { ReEvaluationQaService } from './re-evaluation-qa.service';
import {
  assertExamCellAction,
  examCellRoleFromUser,
} from './exam-cell-rbac.util';

export class QaVersionDto {
  @IsInt() @Min(0) expected_version: number;
}
export class QaReportDto extends SubmitReEvaluationReportDto {
  @IsInt() @Min(0) expected_version: number;
}
type Request = {
  user: {
    user_id: string;
    tenant_id: string;
    role?: string;
    primaryRole?: string;
  };
};

@Controller('api/qa/re-evaluations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Faculty', 'HOD', 'Dean', 'ExamCell', 'DeputyCOE', 'SuperAdmin')
export class ReEvaluationQaController {
  constructor(private readonly qa: ReEvaluationQaService) {}

  @Get(':id')
  get(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const role = examCellRoleFromUser(req.user).toLowerCase();
    const faculty = ['faculty', 'hod', 'dean'].includes(role);
    if (!faculty) assertExamCellAction(role, 'publish_results');
    return this.qa.get(
      req.user.tenant_id,
      id,
      faculty ? req.user.user_id : undefined,
    );
  }

  @Post(':id/report')
  @Roles('Faculty', 'HOD', 'Dean')
  report(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: QaReportDto,
  ) {
    return this.qa.act(
      req.user.tenant_id,
      id,
      'report',
      dto.expected_version,
      req.user.user_id,
      dto,
    );
  }

  @Post(':id/complete')
  @Roles('ExamCell', 'DeputyCOE', 'SuperAdmin')
  complete(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: QaVersionDto,
  ) {
    assertExamCellAction(examCellRoleFromUser(req.user), 'publish_results');
    return this.qa.act(
      req.user.tenant_id,
      id,
      'complete',
      dto.expected_version,
      req.user.user_id,
    );
  }

  @Post(':id/reset')
  @Roles('ExamCell', 'DeputyCOE', 'SuperAdmin')
  reset(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: QaVersionDto,
  ) {
    assertExamCellAction(examCellRoleFromUser(req.user), 'publish_results');
    return this.qa.act(
      req.user.tenant_id,
      id,
      'reset',
      dto.expected_version,
      req.user.user_id,
    );
  }
}
