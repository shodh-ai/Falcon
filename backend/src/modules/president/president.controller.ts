import { Controller, Get, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PresidentService } from './president.service';

@Controller('api/president')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('President', 'SuperAdmin')
export class PresidentController {
  constructor(private readonly president: PresidentService) {}

  @Get('executive-summary')
  executiveSummary() {
    return this.president.getExecutiveSummary();
  }

  @Get('academics')
  academics() {
    return this.president.getAcademics();
  }

  @Get('finance')
  finance() {
    return this.president.getFinance();
  }

  @Get('compliance')
  compliance() {
    return this.president.getCompliance();
  }

  @Get('hr-analytics')
  hrAnalytics() {
    return this.president.getHrAnalytics();
  }
}
