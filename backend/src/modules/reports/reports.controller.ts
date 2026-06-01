import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReportsService } from './reports.service';

@Controller(['api/reports', 'reports'])
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('documents')
  documents(@Req() req: { user: { tenant_id?: string } }) {
    const tenantId = req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
    return this.reports.listPolicyDocuments(tenantId);
  }

  @Get('warehouse/:dataset')
  @Roles('SuperAdmin', 'Registrar', 'President', 'Accountant')
  warehouse(@Req() req: { user: { tenant_id?: string } }, @Param('dataset') dataset: string) {
    const tenantId = req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
    return this.reports.warehouseExport(tenantId, dataset);
  }
}
