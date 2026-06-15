import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ResearchService } from './research.service';

type AuthUser = { tenant_id?: string };

@Controller('api/research')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ResearchController {
  constructor(private readonly research: ResearchService) {}

  @Get('scholars')
  @Roles('SuperAdmin', 'Faculty', 'HOD', 'Dean', 'IQAC', 'Chairman')
  scholars(@Req() req: { user: AuthUser }) {
    return this.research.listScholars(req.user.tenant_id);
  }

  @Patch('scholars/:id/phase')
  @Roles('SuperAdmin', 'Faculty', 'HOD')
  updatePhase(@Req() req: { user: AuthUser }, @Param('id') id: string, @Body() body: { phase: string }) {
    return this.research.updatePhase(req.user.tenant_id ?? '', id, body.phase);
  }

  @Get('grants')
  @Roles('SuperAdmin', 'Faculty', 'HOD', 'IQAC', 'Accountant', 'Chairman')
  grants(@Req() req: { user: AuthUser }) {
    return this.research.listGrants(req.user.tenant_id);
  }

  @Get('grants/:id/utilization-certificate')
  @Roles('SuperAdmin', 'Faculty', 'Accountant', 'IQAC')
  uc(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.research.utilizationCertificate(req.user.tenant_id ?? '', id);
  }
}
