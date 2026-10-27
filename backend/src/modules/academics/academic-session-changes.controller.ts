import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { requireTenantId } from '../../common/utils/require-tenant-id';
import { BelongsToModule } from '../../module-control/module-control.decorators';
import { AcademicSessionChangesService } from './academic-session-changes.service';

type AuthUser = { user_id: string; tenant_id?: string };

@Controller('api/academics/session-changes')
@UseGuards(JwtAuthGuard, RolesGuard)
@BelongsToModule('sis_academics')
export class AcademicSessionChangesController {
  constructor(private readonly changes: AcademicSessionChangesService) {}

  @Get('mine')
  @Roles('Faculty','HOD','Dean','SuperAdmin')
  mine(@Req() req: { user: AuthUser }) {
    return this.changes.listMy(req.user.user_id, requireTenantId(req.user.tenant_id));
  }

  @Get('swap-candidates')
  @Roles('Faculty','HOD','Dean','SuperAdmin')
  swapCandidates(@Req() req: { user: AuthUser },
    @Query('source_timetable_id') timetableId: string,
    @Query('source_date') sourceDate: string,
    @Query('other_date') otherDate: string) {
    return this.changes.swapCandidates(req.user.user_id, requireTenantId(req.user.tenant_id),
      timetableId, sourceDate, otherDate);
  }

  @Post()
  @Roles('Faculty','HOD','Dean','SuperAdmin')
  propose(@Req() req: { user: AuthUser }, @Body() body: {
    move_type: 'RESCHEDULE' | 'SWAP' | 'RESHUFFLE';
    reason: string;
    legs: Array<{
      timetable_id: string;
      source_date: string;
      target_date: string;
      target_start_time: string;
      target_end_time: string;
      target_room?: string | null;
    }>;
  }) {
    return this.changes.propose(req.user.user_id, requireTenantId(req.user.tenant_id),
      body.move_type, body.legs, body.reason);
  }

  @Patch('swap/:groupId/respond')
  @Roles('Faculty','HOD','Dean','SuperAdmin')
  respond(@Req() req: { user: AuthUser }, @Param('groupId') groupId: string,
    @Body() body: { action: 'ACCEPT' | 'DECLINE' }) {
    return this.changes.respondToSwap(req.user.user_id, requireTenantId(req.user.tenant_id),
      groupId, body.action);
  }

  @Get('hod/pending')
  @Roles('HOD','Dean','SuperAdmin')
  pending(@Req() req: { user: AuthUser }) {
    return this.changes.listPendingForHod(req.user.user_id, requireTenantId(req.user.tenant_id));
  }

  @Patch('hod/:groupId')
  @Roles('HOD','Dean','SuperAdmin')
  decide(@Req() req: { user: AuthUser }, @Param('groupId') groupId: string,
    @Body() body: { action: 'APPROVE' | 'REJECT' }) {
    return this.changes.decide(req.user.user_id, requireTenantId(req.user.tenant_id), groupId, body.action);
  }
}
