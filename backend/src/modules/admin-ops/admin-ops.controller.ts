import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminOpsService } from './admin-ops.service';
import { AnnouncementsService } from './announcements.service';

type AuthUser = {
  tenant_id?: string;
  user_id?: string;
  role?: string;
  roles?: string[];
  dept_id?: number;
};

@Controller(['api/admin-ops', 'admin-ops'])
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminOpsController {
  constructor(
    private readonly adminOps: AdminOpsService,
    private readonly announcements: AnnouncementsService,
  ) {}

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  @Get('assets')
  @Roles('SuperAdmin', 'Registrar', 'TransportOfficer')
  assets(@Req() req: { user: AuthUser }) {
    return this.adminOps.listAssets(this.tenant(req));
  }

  @Post('assets')
  @Roles('SuperAdmin', 'Registrar')
  createAsset(
    @Req() req: { user: AuthUser },
    @Body() dto: Record<string, unknown>,
  ) {
    return this.adminOps.createAsset(this.tenant(req), dto);
  }

  @Patch('assets/:id')
  @Roles('SuperAdmin', 'Registrar')
  assignAsset(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.adminOps.assignAsset(this.tenant(req), id, dto);
  }

  @Get('fleet')
  @Roles('SuperAdmin', 'Registrar', 'TransportOfficer')
  fleet(@Req() req: { user: AuthUser }) {
    return this.adminOps.listFleet(this.tenant(req));
  }

  @Post('fleet')
  @Roles('SuperAdmin', 'Registrar', 'TransportOfficer')
  createFleet(
    @Req() req: { user: AuthUser },
    @Body() dto: Record<string, unknown>,
  ) {
    return this.adminOps.createFleetVehicle(this.tenant(req), dto);
  }

  @Get('fleet/fuel-logs')
  @Roles('SuperAdmin', 'Registrar', 'TransportOfficer')
  fuelLogs(@Req() req: { user: AuthUser }) {
    return this.adminOps.fuelLogs(this.tenant(req));
  }

  @Get('events')
  @Roles('SuperAdmin', 'Registrar', 'CampusAdmin')
  events(@Req() req: { user: AuthUser }) {
    return this.adminOps.listEvents(this.tenant(req));
  }

  @Post('events')
  @Roles('SuperAdmin', 'Registrar', 'CampusAdmin')
  createEvent(
    @Req() req: { user: AuthUser },
    @Body() dto: Record<string, unknown>,
  ) {
    return this.adminOps.createEvent(this.tenant(req), dto);
  }

  @Get('timetable')
  @Roles('SuperAdmin', 'Registrar', 'ExamCell', 'CampusAdmin')
  timetable(
    @Req() req: { user: AuthUser },
    @Query('academic_year') academicYear?: string,
  ) {
    return this.adminOps.listTimetable(this.tenant(req), academicYear, req.user);
  }

  @Post('timetable')
  @Roles('SuperAdmin', 'Registrar', 'CampusAdmin')
  timetableSlot(
    @Req() req: { user: AuthUser },
    @Body() dto: Record<string, unknown>,
  ) {
    return this.adminOps.upsertTimetableSlot(this.tenant(req), dto, req.user);
  }

  @Get('transport-zones')
  @Roles('SuperAdmin', 'Registrar', 'TransportOfficer')
  zones(@Req() req: { user: AuthUser }) {
    return this.adminOps.transportZones(this.tenant(req));
  }

  @Get('announcements')
  @Roles('SuperAdmin', 'Registrar', 'President', 'CampusAdmin')
  listAnnouncements(@Req() req: { user: AuthUser }) {
    return this.announcements.listForAdmin(this.tenant(req), req.user);
  }

  @Get('announcements/feed')
  @Roles(
    'Student',
    'Faculty',
    'HOD',
    'Dean',
    'SuperAdmin',
    'Registrar',
    'President',
    'CampusAdmin',
    'Warden',
    'Librarian',
    'LabAdmin',
    'TransportOfficer',
    'Accountant',
    'HR',
    'HrAdmin',
  )
  announcementFeed(@Req() req: { user: AuthUser }) {
    return this.announcements.listForUser(this.tenant(req), req.user);
  }

  @Get('announcements/:id')
  @Roles(
    'Student',
    'Faculty',
    'HOD',
    'Dean',
    'SuperAdmin',
    'Registrar',
    'President',
    'CampusAdmin',
    'Warden',
    'Librarian',
    'LabAdmin',
    'TransportOfficer',
    'Accountant',
    'HR',
    'HrAdmin',
  )
  announcementDetail(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
  ) {
    return this.announcements.getPublishedForViewer(
      this.tenant(req),
      id,
      req.user,
    );
  }

  @Post('announcements')
  @Roles('SuperAdmin', 'Registrar', 'President', 'CampusAdmin')
  createAnnouncement(
    @Req() req: { user: AuthUser & { user_id: string } },
    @Body()
    body: {
      title: string;
      body_html: string;
      target_dept_ids?: number[];
      campus_id?: unknown;
      audience?: string;
      notify?: boolean;
    },
  ) {
    void body.campus_id;
    return this.announcements.create(
      this.tenant(req),
      req.user.user_id,
      {
        title: body.title,
        body_html: body.body_html,
        target_dept_ids: body.target_dept_ids,
        audience: body.audience as
          | 'all'
          | 'students'
          | 'faculty'
          | 'hods'
          | 'staff'
          | undefined,
        notify: body.notify,
      },
      req.user,
    );
  }

  @Patch('announcements/:id')
  @Roles('SuperAdmin', 'Registrar', 'President', 'CampusAdmin')
  updateAnnouncement(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body()
    body: {
      title?: string;
      body_html?: string;
      is_published?: boolean;
    },
  ) {
    return this.announcements.update(this.tenant(req), id, body, req.user);
  }

  @Delete('announcements/:id')
  @Roles('SuperAdmin', 'Registrar', 'President', 'CampusAdmin')
  unpublishAnnouncement(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
  ) {
    return this.announcements.unpublish(this.tenant(req), id, req.user);
  }
}
