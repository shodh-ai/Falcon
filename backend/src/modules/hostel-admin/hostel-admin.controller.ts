import {
  BadRequestException,
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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { HostelAdminService } from './hostel-admin.service';

type AuthUser = {
  user_id: string;
  tenant_id?: string;
  role?: string;
  roles?: string[];
};

@Controller('api/hostel-admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Warden', 'SuperAdmin', 'Registrar')
export class HostelAdminController {
  constructor(private readonly hostelAdmin: HostelAdminService) {}

  private ctx(req: { user: AuthUser }) {
    const roles = req.user.roles?.length
      ? req.user.roles
      : req.user.role
        ? [req.user.role]
        : [];
    return {
      userId: req.user.user_id,
      tenantId: req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001',
      roles,
    };
  }

  @Get('hostels')
  listHostels(@Req() req: { user: AuthUser }) {
    return this.hostelAdmin.listHostels(this.ctx(req));
  }

  @Get('dashboard')
  dashboard(
    @Req() req: { user: AuthUser },
    @Query('hostelId') hostelId?: string,
  ) {
    return this.hostelAdmin.getDashboard(this.ctx(req), hostelId);
  }

  @Get('hostels/:hostelId')
  hostelDetail(
    @Req() req: { user: AuthUser },
    @Param('hostelId') hostelId: string,
  ) {
    return this.hostelAdmin.getHostelDetail(this.ctx(req), hostelId);
  }

  @Get('students')
  students(
    @Req() req: { user: AuthUser },
    @Query('hostelId') hostelId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.hostelAdmin.listStudents(this.ctx(req), {
      hostelId,
      status,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Post('students/transfer')
  transfer(
    @Req() req: { user: AuthUser },
    @Body() dto: Record<string, unknown>,
  ) {
    return this.hostelAdmin.transferStudent(
      this.ctx(req),
      dto as Parameters<HostelAdminService['transferStudent']>[1],
    );
  }

  @Post('students/:studentUserId/evict')
  evict(
    @Req() req: { user: AuthUser },
    @Param('studentUserId') studentUserId: string,
  ) {
    return this.hostelAdmin.evictStudent(this.ctx(req), studentUserId);
  }

  @Post('roll-call')
  markRollCall(
    @Req() req: { user: AuthUser },
    @Body() dto: Record<string, unknown>,
  ) {
    return this.hostelAdmin.markRollCall(
      this.ctx(req),
      dto as Parameters<HostelAdminService['markRollCall']>[1],
    );
  }

  @Get('roll-call/monthly')
  getMonthlyRollCall(
    @Req() req: { user: AuthUser },
    @Query('hostelId') hostelId: string,
    @Query('month') month: string,
  ) {
    if (!hostelId?.trim()) {
      throw new BadRequestException('hostelId is required');
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? '')) {
      throw new BadRequestException('month must use YYYY-MM format');
    }
    return this.hostelAdmin.getMonthlyRollCall(this.ctx(req), hostelId, month);
  }

  @Get('roll-call')
  listRollCall(
    @Req() req: { user: AuthUser },
    @Query('hostelId') hostelId: string,
    @Query('date') date: string,
  ) {
    return this.hostelAdmin.listRollCall(
      this.ctx(req),
      hostelId,
      date ?? new Date().toISOString().slice(0, 10),
    );
  }

  @Get('leaves/stats')
  leaveStats(
    @Req() req: { user: AuthUser },
    @Query('hostelId') hostelId?: string,
  ) {
    return this.hostelAdmin.leaveStats(this.ctx(req), hostelId);
  }

  @Get('leaves')
  leaves(
    @Req() req: { user: AuthUser },
    @Query('hostelId') hostelId?: string,
    @Query('status') status?: string,
  ) {
    return this.hostelAdmin.listLeaves(this.ctx(req), hostelId, status);
  }

  @Patch('leaves/:leaveId')
  updateLeave(
    @Req() req: { user: AuthUser },
    @Param('leaveId') leaveId: string,
    @Body() dto: { status: 'APPROVED' | 'REJECTED' },
  ) {
    return this.hostelAdmin.updateLeaveStatus(
      this.ctx(req),
      leaveId,
      dto.status,
    );
  }

  @Post('leaves')
  createLeave(
    @Req() req: { user: AuthUser },
    @Body() dto: Record<string, unknown>,
  ) {
    return this.hostelAdmin.createLeave(
      this.ctx(req),
      dto as Parameters<HostelAdminService['createLeave']>[1],
    );
  }

  @Get('gate-passes')
  gatePasses(
    @Req() req: { user: AuthUser },
    @Query('hostelId') hostelId?: string,
  ) {
    return this.hostelAdmin.listGatePasses(this.ctx(req), hostelId);
  }

  @Patch('requests/:requestId/approve')
  approveRequest(
    @Req() req: { user: AuthUser },
    @Param('requestId') requestId: string,
  ) {
    return this.hostelAdmin.approveHostelRequest(this.ctx(req), requestId);
  }

  @Patch('requests/:requestId/reject')
  rejectRequest(
    @Req() req: { user: AuthUser },
    @Param('requestId') requestId: string,
  ) {
    return this.hostelAdmin.rejectHostelRequest(this.ctx(req), requestId);
  }

  @Patch('gate-passes/:passId')
  updateGatePass(
    @Req() req: { user: AuthUser },
    @Param('passId') passId: string,
    @Body() dto: { status: 'APPROVED' | 'REJECTED' },
  ) {
    return this.hostelAdmin.updateGatePassStatus(
      this.ctx(req),
      passId,
      dto.status,
    );
  }

  @Get('visitors')
  visitors(
    @Req() req: { user: AuthUser },
    @Query('hostelId') hostelId: string,
  ) {
    return this.hostelAdmin.listVisitorsInside(this.ctx(req), hostelId);
  }

  @Post('visitors/scan')
  visitorScan(
    @Req() req: { user: AuthUser },
    @Body() dto: Record<string, unknown>,
  ) {
    return this.hostelAdmin.processVisitorScan(
      this.ctx(req),
      dto as Parameters<HostelAdminService['processVisitorScan']>[1],
    );
  }

  @Get('tickets')
  tickets(
    @Req() req: { user: AuthUser },
    @Query('hostelId') hostelId?: string,
    @Query('priority') priority?: string,
  ) {
    return this.hostelAdmin.listTickets(this.ctx(req), hostelId, priority);
  }

  @Get('fines')
  fines(@Req() req: { user: AuthUser }, @Query('hostelId') hostelId?: string) {
    return this.hostelAdmin.listFines(this.ctx(req), hostelId);
  }

  @Post('fines')
  createFine(
    @Req() req: { user: AuthUser },
    @Body() dto: Record<string, unknown>,
  ) {
    return this.hostelAdmin.createFine(
      this.ctx(req),
      dto as Parameters<HostelAdminService['createFine']>[1],
    );
  }

  @Get('mess/menu')
  messMenu(@Req() req: { user: AuthUser }) {
    return this.hostelAdmin.getMessMenu(this.ctx(req));
  }

  @Post('mess/menu')
  saveMessMenu(
    @Req() req: { user: AuthUser },
    @Body() dto: Record<string, unknown>,
  ) {
    return this.hostelAdmin.saveMessMenu(
      this.ctx(req),
      dto as Parameters<HostelAdminService['saveMessMenu']>[1],
    );
  }

  @Post('broadcasts')
  broadcast(
    @Req() req: { user: AuthUser },
    @Body() dto: Record<string, unknown>,
  ) {
    return this.hostelAdmin.sendBroadcast(
      this.ctx(req),
      dto as Parameters<HostelAdminService['sendBroadcast']>[1],
    );
  }

  @Get('master-data')
  masterData(
    @Req() req: { user: AuthUser },
    @Query('category') category?: string,
  ) {
    return this.hostelAdmin.listMasterData(this.ctx(req), category);
  }

  @Post('master-data')
  upsertMaster(
    @Req() req: { user: AuthUser },
    @Body() dto: Record<string, unknown>,
  ) {
    return this.hostelAdmin.upsertMasterData(
      this.ctx(req),
      dto as Parameters<HostelAdminService['upsertMasterData']>[1],
    );
  }

  @Get('permissions')
  permissions(@Req() req: { user: AuthUser }) {
    return this.hostelAdmin.listRolePermissions(this.ctx(req));
  }

  @Post('permissions')
  setPermission(
    @Req() req: { user: AuthUser },
    @Body() dto: Record<string, unknown>,
  ) {
    return this.hostelAdmin.setRolePermission(
      this.ctx(req),
      dto as Parameters<HostelAdminService['setRolePermission']>[1],
    );
  }

  @Get('campus-settings')
  campusSettings(@Req() req: { user: AuthUser }) {
    return this.hostelAdmin.getCampusSettings(this.ctx(req));
  }

  @Patch('campus-settings')
  updateCampusSettings(
    @Req() req: { user: AuthUser },
    @Body() dto: { is_hostel_sale_active?: boolean },
  ) {
    return this.hostelAdmin.setCampusSettings(this.ctx(req), dto);
  }
}
