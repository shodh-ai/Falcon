import {
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { FalconNotificationsService } from './falcon-notifications.service';

type AuthUser = { user_id: string; tenant_id: string };

@Controller(['notifications', 'api/notifications'])
@UseGuards(JwtAuthGuard)
export class FalconNotificationsController {
  constructor(private readonly notifications: FalconNotificationsService) {}

  private ctx(req: { user: AuthUser }) {
    return { tenantId: req.user.tenant_id, userId: req.user.user_id };
  }

  @Get()
  list(@Req() req: { user: AuthUser }, @Query('limit') limit?: string) {
    const { tenantId, userId } = this.ctx(req);
    return this.notifications.listForUser(
      tenantId,
      userId,
      this.notifications.clampLimit(Number(limit)),
    );
  }

  @Get('recent')
  recent(@Req() req: { user: AuthUser }) {
    const { tenantId, userId } = this.ctx(req);
    return this.notifications.listRecent(tenantId, userId, 8);
  }

  @Get('unread-count')
  unreadCount(@Req() req: { user: AuthUser }) {
    const { tenantId, userId } = this.ctx(req);
    return this.notifications
      .unreadCount(tenantId, userId)
      .then((count) => ({ count }));
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @Req() req: { user: AuthUser }) {
    const { tenantId, userId } = this.ctx(req);
    return this.notifications.markRead(id, tenantId, userId);
  }

  @Post('mark-all-read')
  markAllRead(@Req() req: { user: AuthUser }) {
    const { tenantId, userId } = this.ctx(req);
    return this.notifications.markAllRead(tenantId, userId);
  }
}
