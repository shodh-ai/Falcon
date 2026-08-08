import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { LabsService } from './labs.service';

type AuthUser = { user_id: string; tenant_id?: string };

@Controller('api/labs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LabsController {
  constructor(private readonly labs: LabsService) {}

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  @Get('zones')
  @Roles('LabAdmin', 'Student', 'Faculty', 'Wrangler', 'COO', 'SuperAdmin', 'CampusAdmin')
  zones(@Req() req: { user: AuthUser }) {
    return this.labs.listZones(this.tenant(req));
  }

  @Get('equipment')
  @Roles('LabAdmin', 'Student', 'Faculty', 'Wrangler', 'COO', 'SuperAdmin', 'CampusAdmin')
  equipment(@Req() req: { user: AuthUser }, @Query('zone_id') zoneId?: string) {
    return this.labs.listEquipment(this.tenant(req), zoneId);
  }

  @Get('checkouts')
  @Roles('LabAdmin', 'COO', 'SuperAdmin', 'CampusAdmin', 'Wrangler')
  checkouts(@Req() req: { user: AuthUser }) {
    return this.labs.listCheckouts(this.tenant(req));
  }

  @Post('checkout')
  @Roles('LabAdmin', 'Student', 'Faculty', 'Wrangler', 'SuperAdmin')
  checkout(
    @Req() req: { user: AuthUser },
    @Body() body: { equipment_id: string; safety_ack?: boolean },
  ) {
    return this.labs.checkout(
      this.tenant(req),
      req.user.user_id,
      body.equipment_id,
      body.safety_ack,
    );
  }

  @Post('checkouts/:id/return')
  @Roles('LabAdmin', 'Student', 'Faculty', 'Wrangler', 'SuperAdmin')
  returnEq(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.labs.returnEquipment(this.tenant(req), id);
  }

  @Get('partners')
  @Roles('LabAdmin', 'COO', 'SuperAdmin', 'CampusAdmin')
  partners(@Req() req: { user: AuthUser }) {
    return this.labs.listPartners(this.tenant(req));
  }

  @Get('work-orders')
  @Roles('LabAdmin', 'COO', 'SuperAdmin', 'CampusAdmin')
  workOrders(@Req() req: { user: AuthUser }, @Query('status') status?: string) {
    return this.labs.listWorkOrders(this.tenant(req), status);
  }

  @Post('work-orders/:id/accept')
  @Roles('COO', 'SuperAdmin', 'CampusAdmin')
  acceptWo(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: { notes?: string },
  ) {
    return this.labs.acceptWorkOrder(
      this.tenant(req),
      id,
      req.user.user_id,
      body.notes,
    );
  }

  @Post('work-orders/:id/complete')
  @Roles('COO', 'SuperAdmin', 'CampusAdmin')
  completeWo(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: { notes?: string },
  ) {
    return this.labs.completeWorkOrder(this.tenant(req), id, body.notes);
  }

  @Post('work-orders/:id/cancel')
  @Roles('COO', 'SuperAdmin', 'CampusAdmin')
  cancelWo(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: { notes?: string },
  ) {
    return this.labs.cancelWorkOrder(
      this.tenant(req),
      id,
      req.user.user_id,
      body.notes,
    );
  }

  @Post('work-orders/:id/spawn-pr')
  @Roles('COO', 'SuperAdmin', 'CampusAdmin')
  spawnPr(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body()
    body: {
      amount_estimate: number;
      description?: string;
      technical_specs?: string;
    },
  ) {
    return this.labs.spawnProcurementFromWorkOrder(
      this.tenant(req),
      id,
      req.user.user_id,
      body,
    );
  }

  @Post('work-orders')
  @Roles('LabAdmin', 'SuperAdmin', 'CampusAdmin')
  createWo(
    @Req() req: { user: AuthUser },
    @Body() body: { partner_id: string; title: string; notes?: string },
  ) {
    return this.labs.createWorkOrder(this.tenant(req), req.user.user_id, body);
  }

  @Get('budget')
  @Roles('LabAdmin', 'COO', 'Accountant', 'SuperAdmin', 'CampusAdmin', 'Chairman')
  budget(@Req() req: { user: AuthUser }) {
    return this.labs.budgetSummary(this.tenant(req));
  }
}
