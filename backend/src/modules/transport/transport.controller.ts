import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TransportService } from './transport.service';

type AuthUser = { user_id: string; tenant_id?: string };

@Controller('api/transport')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransportController {
  constructor(private readonly transport: TransportService) {}

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  @Get('routes')
  @Roles('Student', 'SuperAdmin', 'TransportOfficer', 'Registrar')
  listRoutes(@Req() req: { user: AuthUser }) {
    return this.transport.listRoutesWithStops(this.tenant(req));
  }

  @Get('stops/nearby')
  @Roles('Student', 'SuperAdmin')
  nearbyStops(
    @Req() req: { user: AuthUser },
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('limit') limit?: string,
  ) {
    return this.transport.findNearestStops(
      this.tenant(req),
      Number(lat),
      Number(lng),
      limit ? Number(limit) : 8,
    );
  }

  @Get('my-allocation')
  @Roles('Student', 'SuperAdmin')
  myAllocation(@Req() req: { user: AuthUser }) {
    return this.transport.getMyAllocation(this.tenant(req), req.user.user_id);
  }

  @Post('opt-in')
  @Roles('Student', 'SuperAdmin')
  optIn(@Req() req: { user: AuthUser }, @Body() dto: { stop_id: string }) {
    return this.transport.optIn(this.tenant(req), req.user.user_id, dto.stop_id);
  }

  @Post('confirm-payment')
  @Roles('Student', 'SuperAdmin')
  confirmPayment(
    @Req() req: { user: AuthUser },
    @Body() dto: { allocation_id: string; payment_ref: string },
  ) {
    return this.transport.confirmPayment(
      this.tenant(req),
      req.user.user_id,
      dto.allocation_id,
      dto.payment_ref,
    );
  }

  @Get('bus-pass/qr')
  @Roles('Student', 'SuperAdmin')
  busPassQr(@Req() req: { user: AuthUser }) {
    return this.transport.generateBusPassToken(this.tenant(req), req.user.user_id);
  }

  @Get('live')
  @Roles('Student', 'SuperAdmin')
  liveTracking(@Req() req: { user: AuthUser }) {
    return this.transport.getLiveLocationForStudent(this.tenant(req), req.user.user_id);
  }

  @Post('gps/ping')
  @Roles('TransportOfficer', 'SuperAdmin', 'Faculty')
  gpsPing(
    @Req() req: { user: AuthUser },
    @Body() dto: { route_id: string; lat: number; lng: number; speed?: number },
  ) {
    return this.transport.ingestGpsPing(this.tenant(req), dto.route_id, dto.lat, dto.lng, dto.speed);
  }

  @Post('gps/simulate/:routeId')
  @Roles('TransportOfficer', 'SuperAdmin')
  simulateGps(@Req() req: { user: AuthUser }, @Param('routeId') routeId: string) {
    return this.transport.simulateGpsAlongRoute(this.tenant(req), routeId);
  }

  @Post('scan-pass')
  @Roles('TransportOfficer', 'SuperAdmin', 'Warden', 'Faculty')
  scanPass(
    @Req() req: { user: AuthUser },
    @Body() dto: { qr_payload: string; route_id?: string },
  ) {
    return this.transport.scanBusPass(this.tenant(req), dto.qr_payload, dto.route_id);
  }

  @Get('admin/fleet-map')
  @Roles('TransportOfficer', 'SuperAdmin', 'Registrar')
  fleetMap(@Req() req: { user: AuthUser }) {
    return this.transport.getFleetMap(this.tenant(req));
  }

  @Get('admin/occupancy')
  @Roles('TransportOfficer', 'SuperAdmin', 'Registrar')
  occupancy(@Req() req: { user: AuthUser }) {
    return this.transport.getOccupancyDashboard(this.tenant(req));
  }

  @Post('request-route-change')
  @Roles('Student', 'SuperAdmin')
  requestRouteChange(@Req() req: { user: AuthUser }, @Body() dto: { reason: string }) {
    return this.transport.requestRouteChange(this.tenant(req), req.user.user_id, dto.reason);
  }

  @Post('admin/routes')
  @Roles('TransportOfficer', 'SuperAdmin')
  createRoute(@Req() req: { user: AuthUser }, @Body() dto: Record<string, unknown>) {
    return this.transport.createRoute(this.tenant(req), dto as never);
  }

  @Post('admin/routes/:routeId/stops')
  @Roles('TransportOfficer', 'SuperAdmin')
  addStop(
    @Req() req: { user: AuthUser },
    @Param('routeId') routeId: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.transport.addStop(this.tenant(req), routeId, dto as never);
  }
}
