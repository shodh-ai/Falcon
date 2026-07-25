import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CompetitionsService } from './competitions.service';

type AuthUser = { user_id: string; tenant_id?: string };

@Controller('api/competitions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompetitionsController {
  constructor(private readonly competitions: CompetitionsService) {}

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  @Get()
  @Roles('Student', 'CompetitionAdmin', 'COO', 'SuperAdmin', 'CampusAdmin', 'Incubation_Admin')
  list(@Req() req: { user: AuthUser }) {
    return this.competitions.listCompetitions(this.tenant(req));
  }

  @Get('entries')
  @Roles('CompetitionAdmin', 'COO', 'SuperAdmin', 'CampusAdmin', 'Student')
  entries(@Req() req: { user: AuthUser }, @Query('competition_id') competitionId?: string) {
    return this.competitions.listEntries(this.tenant(req), competitionId);
  }

  @Get('funnel')
  @Roles('CompetitionAdmin', 'COO', 'Chairman', 'President', 'SuperAdmin', 'CampusAdmin')
  funnel(@Req() req: { user: AuthUser }) {
    return this.competitions.funnelStats(this.tenant(req));
  }

  @Post('entries')
  @Roles('Student', 'CompetitionAdmin', 'SuperAdmin')
  submit(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      competition_id: string;
      applicant_name?: string;
      applicant_email?: string;
      whitepaper_url?: string;
    },
  ) {
    return this.competitions.submitEntry(this.tenant(req), req.user.user_id, body);
  }

  @Post('entries/:id/advance')
  @Roles('CompetitionAdmin', 'SuperAdmin', 'CampusAdmin')
  advance(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: { stage: string; status?: string },
  ) {
    return this.competitions.advanceEntry(this.tenant(req), id, body.stage, body.status);
  }

  @Post('entries/:id/golden-ticket')
  @Roles('CompetitionAdmin', 'SuperAdmin', 'CampusAdmin')
  golden(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.competitions.issueGoldenTicket(this.tenant(req), id);
  }

  @Get('network/channels')
  @Roles('Student', 'CompetitionAdmin', 'COO', 'SuperAdmin', 'CampusAdmin')
  channels(@Req() req: { user: AuthUser }) {
    return this.competitions.listChannels(this.tenant(req));
  }

  @Get('network/channels/:id/posts')
  @Roles('Student', 'CompetitionAdmin', 'COO', 'SuperAdmin', 'CampusAdmin')
  posts(@Param('id') id: string) {
    return this.competitions.listPosts(id);
  }

  @Post('network/posts')
  @Roles('Student', 'CompetitionAdmin', 'SuperAdmin', 'CampusAdmin')
  post(
    @Req() req: { user: AuthUser },
    @Body() body: { channel_id: string; body: string },
  ) {
    return this.competitions.createPost(req.user.user_id, body);
  }

  @Get('bounties')
  @Roles('Student', 'CompetitionAdmin', 'Accountant', 'COO', 'SuperAdmin', 'CampusAdmin')
  bounties(@Req() req: { user: AuthUser }) {
    return this.competitions.listBounties(this.tenant(req));
  }

  @Post('bounties/:id/claim')
  @Roles('Student', 'SuperAdmin')
  claim(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.competitions.claimBounty(this.tenant(req), id, req.user.user_id);
  }

  @Post('bounties/:id/pay')
  @Roles('CompetitionAdmin', 'Accountant', 'SuperAdmin')
  pay(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.competitions.markBountyPaid(this.tenant(req), id);
  }

  @Post('bounties/:id/reopen')
  @Roles('CompetitionAdmin', 'SuperAdmin')
  reopen(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.competitions.reopenBounty(this.tenant(req), id);
  }
}
