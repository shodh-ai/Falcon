import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { BelongsToModule } from '../../module-control/module-control.decorators';
import { PrincipalOversightService } from './principal-oversight.service';
class NewCase {
  @IsIn(['FOLLOW_UP', 'TIMETABLE']) kind: 'FOLLOW_UP' | 'TIMETABLE';
  @IsOptional() @IsUUID() source_id?: string;
  @IsString() @MinLength(5) @MaxLength(2000) title: string;
  @IsString() @MinLength(5) @MaxLength(2000) reason: string;
  @IsOptional() @IsString() due_date?: string;
}
class Decision {
  @IsIn([
    'APPROVE',
    'REJECT',
    'RETURN',
    'RETRY',
    'RESPOND',
    'CLOSE',
    'RESUBMIT',
  ])
  action: string;
  @IsString() @MinLength(5) @MaxLength(2000) note: string;
}
type Request = { user: { user_id: string; tenant_id?: string } };
function revision(match: string) {
  if (!/^"?\d+"?$/.test(match ?? ''))
    throw new BadRequestException('If-Match revision is required');
  return Number(match.replace(/"/g, ''));
}
@Controller('api/academics/department-oversight')
@BelongsToModule('sis_academics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PrincipalOversightController {
  constructor(private readonly service: PrincipalOversightService) {}
  @Get('principal')
  @Roles('Principal')
  overview(@Req() req: Request, @Headers('x-department-id') dept?: string) {
    return this.service.overview(req.user, dept);
  }
  @Get('principal/cases')
  @Roles('Principal')
  principalCases(
    @Req() req: Request,
    @Headers('x-department-id') dept?: string,
  ) {
    return this.service.list(req.user, 'PRINCIPAL', dept);
  }
  @Get('hod/availability')
  @Roles('HOD')
  available(@Req() req: Request) {
    return this.service.hodAvailability(req.user);
  }
  @Get('hod/cases')
  @Roles('HOD')
  hodCases(@Req() req: Request, @Headers('x-department-id') dept?: string) {
    return this.service.list(req.user, 'HOD', dept);
  }
  @Get('principal/cases/:id')
  @Roles('Principal')
  principalDetail(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(req.user, 'PRINCIPAL', id);
  }
  @Get('hod/cases/:id')
  @Roles('HOD')
  hodDetail(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(req.user, 'HOD', id);
  }
  @Post('principal/cases')
  @Roles('Principal')
  followup(
    @Req() req: Request,
    @Body() input: NewCase,
    @Headers('idempotency-key') key: string,
    @Headers('x-department-id') dept?: string,
  ) {
    return this.service.create(req.user, 'PRINCIPAL', input, key, dept);
  }
  @Post('hod/cases')
  @Roles('HOD')
  escalate(
    @Req() req: Request,
    @Body() input: NewCase,
    @Headers('idempotency-key') key: string,
    @Headers('x-department-id') dept?: string,
  ) {
    return this.service.create(req.user, 'HOD', input, key, dept);
  }
  @Patch('principal/cases/:id')
  @Roles('Principal')
  decide(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: Decision,
    @Headers('idempotency-key') key: string,
    @Headers('if-match') match: string,
  ) {
    return this.service.act(
      req.user,
      'PRINCIPAL',
      id,
      revision(match),
      input,
      key,
    );
  }
  @Patch('hod/cases/:id')
  @Roles('HOD')
  respond(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: Decision,
    @Headers('idempotency-key') key: string,
    @Headers('if-match') match: string,
  ) {
    return this.service.act(req.user, 'HOD', id, revision(match), input, key);
  }
}
