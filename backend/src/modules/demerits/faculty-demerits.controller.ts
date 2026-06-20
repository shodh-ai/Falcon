import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DemeritsService } from './demerits.service';
import { SubmitDemeritIncidentDto } from './dto/demerits.dto';

type AuthUser = { user_id: string; tenant_id?: string };

@Controller('api/demerits')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FacultyDemeritsController {
  constructor(private readonly demerits: DemeritsService) {}

  @Post('submit')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  submit(
    @Req() req: { user: AuthUser },
    @Body() dto: SubmitDemeritIncidentDto,
  ) {
    return this.demerits.submitIncident(
      this.tenant(req),
      req.user.user_id,
      dto,
    );
  }

  @Get('faculty/history')
  @Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
  history(@Req() req: { user: AuthUser }) {
    return this.demerits.listFacultyHistory(this.tenant(req), req.user.user_id);
  }

  @Get('form-options')
  @Roles('Faculty', 'HOD', 'Dean', 'DC_MEMBER', 'SuperAdmin')
  formOptions(@Req() req: { user: AuthUser }) {
    return this.demerits.getFormOptions(this.tenant(req), req.user.user_id);
  }

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }
}
