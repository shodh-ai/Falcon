import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DofaEngineService } from './dofa-engine.service';

type AuthUser = {
  tenant_id?: string;
  user_id: string;
  role?: string;
  roles?: string[];
};

/** Plan alias: POST /api/hr/headcount-requests → Universal DOFA HR_HIRE */
@Controller('api/hr')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HrHeadcountAliasController {
  constructor(private readonly dofa: DofaEngineService) {}

  @Get('headcount-requests')
  @Roles(
    'HOD',
    'Dean',
    'HR',
    'HRAdmin',
    'CFO',
    'Chairman',
    'President',
    'SuperAdmin',
    'CampusAdmin',
  )
  list(@Req() req: { user: AuthUser }) {
    return this.dofa.listHeadcount(req.user.tenant_id);
  }

  @Post('headcount-requests')
  @Roles('HOD', 'Dean', 'HR', 'HRAdmin', 'SuperAdmin', 'CampusAdmin')
  create(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      job_title: string;
      department?: string;
      ctc_annual: number;
      candidate_email?: string;
      candidate_name?: string;
    },
  ) {
    return this.dofa.openHeadcountRequest(
      req.user.tenant_id,
      req.user.user_id,
      body,
    );
  }
}
