import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { BacklogService } from './backlog.service';
import {
  ApplyBacklogDto,
  BacklogOfferingStatusDto,
  ConfigureBacklogOfferingDto,
  ReviewBacklogDto,
  SaveBacklogMarksDto,
} from './dto/backlog.dto';
import { EXAM_CELL_ACCESS_ROLES } from './exam-cell.constants';
import {
  assertExamCellAction,
  examCellRolesFromUser,
} from './exam-cell-rbac.util';

type Request = {
  user: {
    user_id: string;
    tenant_id?: string;
    role?: string;
    primaryRole?: string;
    roles?: string[];
  };
};
function tenant(req: Request) {
  if (!req.user.tenant_id)
    throw new UnauthorizedException('Tenant context is required');
  return req.user.tenant_id;
}

@Controller('api/exam-cell/backlog')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...EXAM_CELL_ACCESS_ROLES)
export class BacklogStaffController {
  constructor(private readonly backlog: BacklogService) {}
  @Get('offerings') offerings(@Req() req: Request) {
    return this.backlog.listOfferings(tenant(req));
  }
  @Post('offerings') configure(
    @Req() req: Request,
    @Body() dto: ConfigureBacklogOfferingDto,
  ) {
    assertExamCellAction(examCellRolesFromUser(req.user), 'manage_sessions');
    return this.backlog.configure(tenant(req), req.user.user_id, dto);
  }
  @Post('offerings/:id/status') status(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: BacklogOfferingStatusDto,
  ) {
    assertExamCellAction(examCellRolesFromUser(req.user), 'manage_sessions');
    return this.backlog.setOfferingStatus(
      tenant(req),
      req.user.user_id,
      id,
      dto.status,
    );
  }
  @Get('attempts') attempts(@Req() req: Request) {
    return this.backlog.listAttempts(tenant(req));
  }
  @Post('attempts/:id/review') review(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReviewBacklogDto,
  ) {
    assertExamCellAction(examCellRolesFromUser(req.user), 'manage_sessions');
    return this.backlog.review(tenant(req), req.user.user_id, id, dto);
  }
  @Post('attempts/:id/audit') audit(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    assertExamCellAction(examCellRolesFromUser(req.user), 'manage_sessions');
    return this.backlog.advanceMarks(
      tenant(req),
      req.user.user_id,
      id,
      'COE_APPROVED',
    );
  }
  @Post('attempts/:id/publish') publish(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    assertExamCellAction(examCellRolesFromUser(req.user), 'publish_results');
    return this.backlog.publish(tenant(req), req.user.user_id, id);
  }
  @Get('dean/attempts') @Roles('Dean', 'HOD', 'SuperAdmin') deanAttempts(
    @Req() req: Request,
  ) {
    return this.backlog.listDeanAttempts(
      tenant(req),
      req.user.user_id,
      examCellRolesFromUser(req.user),
    );
  }
  @Post('attempts/:id/dean-approval')
  @Roles('Dean', 'HOD', 'SuperAdmin')
  deanApprove(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.backlog.advanceMarks(
      tenant(req),
      req.user.user_id,
      id,
      'DEAN_APPROVED',
      examCellRolesFromUser(req.user),
    );
  }
}

@Controller('api/academics/exams/backlog')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Student')
export class BacklogStudentController {
  constructor(private readonly backlog: BacklogService) {}
  @Get('options') async options(@Req() req: Request) {
    const t = tenant(req);
    const [offerings, failed_results, applications] = await Promise.all([
      this.backlog.listOfferings(t, true),
      this.backlog.listSources(t, req.user.user_id),
      this.backlog.listAttempts(t, { student: req.user.user_id }),
    ]);
    return { offerings, failed_results, applications };
  }
  @Post('applications') apply(
    @Req() req: Request,
    @Body() dto: ApplyBacklogDto,
  ) {
    return this.backlog.apply(tenant(req), req.user.user_id, dto);
  }
  @Post('attempts/:id/payment-sync') payment(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.backlog.synchronizePayment(tenant(req), req.user.user_id, id);
  }
}

@Controller('api/academics/faculty/backlog')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Faculty', 'HOD')
export class BacklogFacultyController {
  constructor(private readonly backlog: BacklogService) {}
  @Get() attempts(@Req() req: Request) {
    return this.backlog.listAttempts(tenant(req), {
      faculty: req.user.user_id,
    });
  }
  @Post('attempts/:id/marks') marks(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SaveBacklogMarksDto,
  ) {
    return this.backlog.saveMarks(
      tenant(req),
      req.user.user_id,
      id,
      dto.marks_obtained,
    );
  }
  @Post('attempts/:id/submit') submit(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.backlog.advanceMarks(
      tenant(req),
      req.user.user_id,
      id,
      'SUBMITTED',
    );
  }
}
