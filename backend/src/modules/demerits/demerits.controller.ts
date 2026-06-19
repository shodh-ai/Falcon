import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DemeritsService } from './demerits.service';
import { ReviewDemeritIncidentDto } from './dto/demerits.dto';

type AuthUser = { user_id: string; tenant_id?: string };

@Controller('api/demerits')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DemeritsController {
  constructor(private readonly demerits: DemeritsService) {}

  @Get('pending')
  @Roles('DC_MEMBER', 'SuperAdmin')
  listPending(@Req() req: { user: AuthUser }) {
    return this.demerits.listPending(this.tenant(req));
  }

  @Get('dashboard')
  @Roles('DC_MEMBER', 'SuperAdmin')
  dashboard(@Req() req: { user: AuthUser }) {
    return this.demerits.getDashboard(this.tenant(req));
  }

  @Post('review/:id')
  @Roles('DC_MEMBER', 'SuperAdmin')
  review(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: ReviewDemeritIncidentDto,
  ) {
    return this.demerits.reviewIncident(this.tenant(req), id, req.user.user_id, dto);
  }

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }
}
