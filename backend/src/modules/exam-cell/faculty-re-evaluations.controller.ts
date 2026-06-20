import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ExamCellService } from './exam-cell.service';
import { SubmitReEvaluationReportDto } from './dto/re-evaluations.dto';

type AuthUser = { user_id: string };

@Controller('api/academics/faculty/re-evaluations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
export class FacultyReEvaluationsController {
  constructor(private readonly examCell: ExamCellService) {}

  @Get()
  list(@Req() req: { user: AuthUser }) {
    return this.examCell.listFacultyReEvaluations(req.user.user_id);
  }

  @Post(':applicationId/report')
  submitReport(
    @Req() req: { user: AuthUser },
    @Param('applicationId') applicationId: string,
    @Body() dto: SubmitReEvaluationReportDto,
  ) {
    return this.examCell.submitReEvaluationReport(
      req.user.user_id,
      applicationId,
      dto,
    );
  }
}
