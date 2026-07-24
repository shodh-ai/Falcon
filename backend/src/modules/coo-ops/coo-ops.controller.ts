import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CooOpsService } from './coo-ops.service';

type AuthUser = { user_id: string; tenant_id?: string; role?: string; roles?: string[] };

@Controller('api/operations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CooOpsController {
  constructor(private readonly ops: CooOpsService) {}

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  private primaryRole(user: AuthUser) {
    return user.role ?? user.roles?.[0] ?? 'Accountant';
  }

  @Get('dashboard')
  @Roles('COO', 'EstateOfficer', 'Chairman', 'President', 'SuperAdmin', 'CampusAdmin')
  dashboard(@Req() req: { user: AuthUser }) {
    return this.ops.dashboard(this.tenant(req));
  }

  @Get('esm/queues')
  @Roles('COO', 'EstateOfficer', 'SuperAdmin', 'CampusAdmin')
  queues(@Req() req: { user: AuthUser }) {
    return this.ops.listQueues(this.tenant(req));
  }

  @Get('esm/locations')
  @Roles('COO', 'EstateOfficer', 'SuperAdmin', 'CampusAdmin', 'Student', 'Faculty')
  locations(@Req() req: { user: AuthUser }) {
    return this.ops.listLocations(this.tenant(req));
  }

  @Post('esm/from-qr')
  @Roles('COO', 'EstateOfficer', 'Student', 'Faculty', 'SuperAdmin', 'CampusAdmin')
  fromQr(
    @Req() req: { user: AuthUser },
    @Body() body: { qr_code: string; subject?: string },
  ) {
    return this.ops.createTicketFromQr(
      this.tenant(req),
      req.user.user_id,
      body.qr_code,
      body.subject,
    );
  }

  @Post('esm/tickets/:id/scan-close')
  @Roles('COO', 'EstateOfficer', 'SuperAdmin', 'CampusAdmin')
  scanClose(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.ops.scanCloseTicket(this.tenant(req), req.user.user_id, id);
  }

  @Get('p2p/dofa')
  @Roles('COO', 'Accountant', 'LabAdmin', 'SuperAdmin', 'CampusAdmin')
  dofa(@Req() req: { user: AuthUser }) {
    return this.ops.listDofa(this.tenant(req));
  }

  @Get('p2p/purchase-orders')
  @Roles('COO', 'Accountant', 'LabAdmin', 'SuperAdmin', 'CampusAdmin')
  pos(@Req() req: { user: AuthUser }) {
    return this.ops.listPurchaseOrders(this.tenant(req));
  }

  @Post('p2p/purchase-orders')
  @Roles('COO', 'Accountant', 'LabAdmin', 'SuperAdmin', 'CampusAdmin')
  createPo(
    @Req() req: { user: AuthUser },
    @Body() body: { description: string; amount: number; vendor_id?: string; program_id?: string },
  ) {
    return this.ops.createPoWithDofa(
      this.tenant(req),
      req.user.user_id,
      this.primaryRole(req.user),
      body,
    );
  }

  @Get('p2p/grn')
  @Roles('COO', 'Accountant', 'LabAdmin', 'SuperAdmin', 'CampusAdmin')
  grns(@Req() req: { user: AuthUser }) {
    return this.ops.listGrns(this.tenant(req));
  }

  @Post('p2p/grn')
  @Roles('COO', 'Accountant', 'LabAdmin', 'SuperAdmin', 'CampusAdmin')
  createGrn(
    @Req() req: { user: AuthUser },
    @Body() body: { po_id: string; notes?: string; qty_received?: number },
  ) {
    return this.ops.createGrn(this.tenant(req), req.user.user_id, body);
  }

  @Get('p2p/purchase-orders/:id/three-way-match')
  @Roles('COO', 'Accountant', 'SuperAdmin', 'CampusAdmin')
  match(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.ops.threeWayMatch(this.tenant(req), id);
  }

  @Post('p2p/purchase-orders/:id/pay')
  @Roles('COO', 'Accountant', 'SuperAdmin')
  payPo(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.ops.payPurchaseOrder(this.tenant(req), req.user.user_id, id);
  }

  @Get('p2p/penalties')
  @Roles('COO', 'Accountant', 'SuperAdmin', 'CampusAdmin', 'Chairman')
  penalties(@Req() req: { user: AuthUser }) {
    return this.ops.listPenalties(this.tenant(req));
  }

  @Post('p2p/penalties')
  @Roles('COO', 'Accountant', 'SuperAdmin')
  applyPenalty(
    @Req() req: { user: AuthUser },
    @Body() body: { vendor_id: string; reason: string; amount_inr: number },
  ) {
    return this.ops.applyPenalty(this.tenant(req), body);
  }
}
