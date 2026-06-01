import { Controller, Get } from '@nestjs/common';
import { AdminOpsService } from './admin-ops.service';

@Controller('api/admin-ops')
export class AdminOpsController {
  constructor(private readonly adminOps: AdminOpsService) {}

  @Get('assets')
  assets() {
    return this.adminOps.assets();
  }

  @Get('visitors')
  visitors() {
    return this.adminOps.visitors();
  }

  @Get('fleet')
  fleet() {
    return this.adminOps.fleet();
  }

  @Get('fleet/fuel-logs')
  fuelLogs() {
    return this.adminOps.fuelLogs();
  }
}
