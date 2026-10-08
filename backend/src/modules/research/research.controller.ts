import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ResearchService } from './research.service';

type AuthUser = { tenant_id?: string; user_id: string; role?: string };

@Controller('api/research')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ResearchController {
  constructor(private readonly research: ResearchService) {}

  @Get('scholars')
  @Roles(
    'SuperAdmin',
    'CampusAdmin',
    'Registrar',
    'Faculty',
    'HOD',
    'Dean',
    'IQAC',
    'Chairman',
  )
  scholars(@Req() req: { user: AuthUser }) {
    return this.research.listScholars(req.user.tenant_id);
  }

  @Patch('scholars/:id/phase')
  @Roles('SuperAdmin', 'Faculty', 'HOD', 'DeanOfResearch')
  updatePhase(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: { phase: string },
  ) {
    return this.research.updatePhase(req.user.tenant_id ?? '', id, body.phase);
  }

  @Get('grants')
  @Roles(
    'SuperAdmin',
    'Faculty',
    'HOD',
    'IQAC',
    'Accountant',
    'Chairman',
    'DeanOfResearch',
    'CFO',
    'LabAdmin',
  )
  grants(@Req() req: { user: AuthUser }) {
    return this.research.listGrants(req.user.tenant_id);
  }

  @Get('grants/:id/utilization-certificate')
  @Roles('SuperAdmin', 'Faculty', 'Accountant', 'IQAC', 'DeanOfResearch', 'CFO')
  uc(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.research.utilizationCertificate(req.user.tenant_id ?? '', id);
  }

  @Get('proposals')
  @Roles(
    'SuperAdmin',
    'Faculty',
    'HOD',
    'DeanOfResearch',
    'LabAdmin',
    'Chairman',
  )
  proposals(@Req() req: { user: AuthUser }, @Query('status') status?: string) {
    return this.research.listProposals(req.user.tenant_id, status);
  }

  @Post('proposals')
  @Roles('SuperAdmin', 'Faculty', 'HOD', 'LabAdmin')
  createProposal(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      title: string;
      agency?: string;
      requested_amount: number;
      abstract?: string;
      allowed_expense_categories?: string[];
    },
  ) {
    return this.research.createProposal(
      req.user.tenant_id,
      req.user.user_id,
      body,
    );
  }

  @Post('proposals/:id/submit')
  @Roles('SuperAdmin', 'Faculty', 'HOD', 'LabAdmin')
  submitProposal(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.research.submitProposal(
      req.user.tenant_id,
      req.user.user_id,
      id,
    );
  }

  @Post('proposals/:id/decide')
  @Roles('DeanOfResearch', 'SuperAdmin', 'Chairman')
  decideProposal(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: { decision: 'APPROVED' | 'REJECTED'; notes?: string },
  ) {
    return this.research.decideProposal(
      req.user.tenant_id,
      req.user.user_id,
      id,
      body,
    );
  }

  @Get('ip')
  @Roles(
    'SuperAdmin',
    'Faculty',
    'HOD',
    'DeanOfResearch',
    'IQAC',
    'Chairman',
    'LabAdmin',
  )
  listIp(@Req() req: { user: AuthUser }) {
    return this.research.listIp(req.user.tenant_id);
  }

  @Post('ip')
  @Roles('SuperAdmin', 'Faculty', 'HOD', 'DeanOfResearch', 'LabAdmin')
  createIp(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      title: string;
      ip_type?: string;
      inventors?: string;
      grant_id?: string;
      filing_ref?: string;
      notes?: string;
    },
  ) {
    return this.research.createIp(req.user.tenant_id, req.user.user_id, body);
  }
}
