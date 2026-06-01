import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ExamCellService } from './exam-cell.service';

@Controller('api/exam-cell')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ExamCell', 'SuperAdmin')
export class ExamCellController {
  constructor(private readonly examCell: ExamCellService) {}

  @Get('seating-plans')
  seatingPlans() {
    return this.examCell.listSeatingPlans();
  }

  @Get('grade-cards')
  gradeCards() {
    return this.examCell.listGradeCards();
  }

  @Get('ufm-cases')
  ufmCases() {
    return this.examCell.listUfmCases();
  }

  @Post('ufm-cases')
  createUfmCase(@Body() dto: { student_user_id?: string; exam_id?: string; description?: string; penalty_applied?: string }) {
    return this.examCell.createUfmCase(dto);
  }
}
