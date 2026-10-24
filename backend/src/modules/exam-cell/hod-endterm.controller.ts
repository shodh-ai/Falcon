import { Body, Controller, Get, Param, Post, Req, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { requireTenantId } from '../../common/utils/require-tenant-id';
import { ResultControlService } from './result-control.service';
import { BelongsToModule } from '../../module-control/module-control.decorators';

type HodRequest = { user: { user_id: string; tenant_id?: string } };

class HodEndTermDecisionDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @Matches(/^[a-f0-9]{64}$/)
  expected_input_hash!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

@Controller('api/hod/end-term-results')
@BelongsToModule('examinations_credentials')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('HOD')
export class HodEndTermController {
  constructor(private readonly results: ResultControlService) {}

  @Get()
  list(@Req() req: HodRequest) {
    return this.results.listHodEndTermSessions(requireTenantId(req.user.tenant_id), req.user.user_id);
  }

  @Get(':sessionId')
  get(@Req() req: HodRequest, @Param('sessionId', new ParseUUIDPipe()) sessionId: string) {
    return this.results.getHodEndTermSession(requireTenantId(req.user.tenant_id), sessionId, req.user.user_id);
  }

  @Post(':sessionId/decision')
  decide(
    @Req() req: HodRequest,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() dto: HodEndTermDecisionDto,
  ) {
    return this.results.decideHodEndTermSession(
      requireTenantId(req.user.tenant_id), sessionId, req.user.user_id,
      dto.decision, dto.expected_input_hash, dto.comment,
    );
  }
}
