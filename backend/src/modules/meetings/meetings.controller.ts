import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MeetingsService } from './meetings.service';
import {
  PublishMeetingMinutesDto,
  RequestMeetingDto,
  RespondMeetingDto,
  ScheduleMeetingDto,
  UpdateMeetingAgendaDto,
} from './dto/meetings.dto';

type AuthUser = {
  user_id: string;
  tenant_id?: string;
  roles?: string[];
  role?: string;
  primaryRole?: string;
};

@Controller('api/meetings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  private actor(req: { user: AuthUser }) {
    const roles = req.user.roles?.length
      ? req.user.roles
      : req.user.role
        ? [req.user.role]
        : [];
    return {
      userId: req.user.user_id,
      tenantId: req.user.tenant_id!,
      roles,
      primaryRole: req.user.primaryRole ?? req.user.role,
    };
  }

  @Get()
  @Roles(
    'Faculty',
    'HOD',
    'Dean',
    'HR',
    'HRAdmin',
    'President',
    'Chairman',
    'Registrar',
    'SuperAdmin',
    'Accountant',
  )
  list(@Req() req: { user: AuthUser }) {
    return this.meetings.listMeetings(this.actor(req));
  }

  @Get('eligible-participants')
  @Roles(
    'Faculty',
    'HOD',
    'Dean',
    'HR',
    'HRAdmin',
    'President',
    'Chairman',
    'Registrar',
    'SuperAdmin',
  )
  eligible(
    @Req() req: { user: AuthUser },
    @Query('direction') direction?: 'schedule' | 'request',
  ) {
    return this.meetings.listEligibleParticipants(
      this.actor(req),
      direction === 'request' ? 'request' : 'schedule',
    );
  }

  @Get(':id')
  @Roles(
    'Faculty',
    'HOD',
    'Dean',
    'HR',
    'HRAdmin',
    'President',
    'Chairman',
    'Registrar',
    'SuperAdmin',
    'Accountant',
  )
  getOne(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.meetings.getMeeting(this.actor(req), id);
  }

  @Post('schedule')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin', 'President', 'Chairman', 'Registrar', 'SuperAdmin')
  schedule(@Req() req: { user: AuthUser }, @Body() dto: ScheduleMeetingDto) {
    return this.meetings.scheduleMeeting(this.actor(req), dto);
  }

  @Post('request')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin', 'President', 'Chairman', 'Registrar', 'SuperAdmin')
  request(@Req() req: { user: AuthUser }, @Body() dto: RequestMeetingDto) {
    return this.meetings.requestMeeting(this.actor(req), dto);
  }

  @Post(':id/respond')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin', 'President', 'Chairman', 'Registrar', 'SuperAdmin')
  respond(@Req() req: { user: AuthUser }, @Param('id') id: string, @Body() dto: RespondMeetingDto) {
    return this.meetings.respondMeeting(this.actor(req), id, dto);
  }

  @Patch(':id/agenda')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin', 'President', 'Chairman', 'Registrar', 'SuperAdmin')
  updateAgenda(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: UpdateMeetingAgendaDto,
  ) {
    return this.meetings.updateAgenda(this.actor(req), id, dto);
  }

  @Post(':id/minutes')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin', 'President', 'Chairman', 'Registrar', 'SuperAdmin')
  publishMinutes(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: PublishMeetingMinutesDto,
  ) {
    return this.meetings.publishMinutes(this.actor(req), id, dto);
  }
}
