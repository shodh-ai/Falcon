import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminOpsService } from './admin-ops.service';

type AuthUser = { tenant_id?: string };

@Controller(['api/admin-ops', 'admin-ops'])
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminOpsController {
  constructor(private readonly adminOps: AdminOpsService) {}

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
  createAsset(@Req() req: { user: AuthUser }, @Body() dto: Record<string, unknown>) {
    return this.adminOps.createAsset(this.tenant(req), dto);
  }

  @Patch('assets/:id')
  @Roles('SuperAdmin', 'Registrar')
  assignAsset(@Req() req: { user: AuthUser }, @Param('id') id: string, @Body() dto: Record<string, unknown>) {
    return this.adminOps.assignAsset(this.tenant(req), id, dto);
  }

  @Get('fleet')
  @Roles('SuperAdmin', 'Registrar', 'TransportOfficer')
  fleet(@Req() req: { user: AuthUser }) {
    return this.adminOps.listFleet(this.tenant(req));
  }

  @Post('fleet')
  @Roles('SuperAdmin', 'Registrar', 'TransportOfficer')
  createFleet(@Req() req: { user: AuthUser }, @Body() dto: Record<string, unknown>) {
    return this.adminOps.createFleetVehicle(this.tenant(req), dto);
  }

  @Get('fleet/fuel-logs')
  @Roles('SuperAdmin', 'Registrar', 'TransportOfficer')
  fuelLogs(@Req() req: { user: AuthUser }) {
    return this.adminOps.fuelLogs(this.tenant(req));
  }

  @Get('events')
  @Roles('SuperAdmin', 'Registrar')
  events(@Req() req: { user: AuthUser }) {
    return this.adminOps.listEvents(this.tenant(req));
  }

  @Post('events')
  @Roles('SuperAdmin', 'Registrar')
  createEvent(@Req() req: { user: AuthUser }, @Body() dto: Record<string, unknown>) {
    return this.adminOps.createEvent(this.tenant(req), dto);
  }

  @Get('timetable')
  @Roles('SuperAdmin', 'Registrar', 'ExamCell')
  timetable(@Req() req: { user: AuthUser }, @Query('academic_year') academicYear?: string) {
    return this.adminOps.listTimetable(this.tenant(req), academicYear);
  }

  @Post('timetable')
  @Roles('SuperAdmin', 'Registrar')
  timetableSlot(@Req() req: { user: AuthUser }, @Body() dto: Record<string, unknown>) {
    return this.adminOps.upsertTimetableSlot(this.tenant(req), dto);
  }

  @Get('transport-zones')
  @Roles('SuperAdmin', 'Registrar', 'TransportOfficer')
  zones(@Req() req: { user: AuthUser }) {
    return this.adminOps.transportZones(this.tenant(req));
  }
}
