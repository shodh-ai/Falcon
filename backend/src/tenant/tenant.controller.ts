import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../common/decorators/roles.decorator';
import { TenantService } from './tenant.service';

@Controller('api/tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  /** Public branding resolution for subdomain routing (no auth required). */
  @Public()
  @Get('resolve/:subdomain')
  resolveBySubdomain(@Param('subdomain') subdomain: string) {
    return this.tenantService.getBrandingBySubdomain(subdomain);
  }
}
