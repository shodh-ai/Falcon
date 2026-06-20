import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ClinicService } from './clinic.service';

type AuthUser = { tenant_id?: string };

@Controller('api/clinic')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SuperAdmin', 'Registrar')
export class ClinicController {
  constructor(private readonly clinic: ClinicService) {}

  @Get('records')
  records(@Req() req: { user: AuthUser }) {
    return this.clinic.listRecords(req.user.tenant_id);
  }

  @Get('lookup')
  lookup(@Req() req: { user: AuthUser }, @Query('q') q: string) {
    return this.clinic.lookupPatient(req.user.tenant_id ?? '', q);
  }

  @Post('visits')
  logVisit(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      patient_user_id: string;
      doctor_name: string;
      diagnosis: string;
      rest_advised_days?: number;
    },
  ) {
    return this.clinic.logVisit(req.user.tenant_id ?? '', body);
  }
}
