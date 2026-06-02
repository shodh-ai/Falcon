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

type AuthUser = { user_id: string; tenant_id?: string };

@Controller(['notifications', 'api/notifications'])
@UseGuards(JwtAuthGuard)
export class FalconNotificationsController {
  constructor(private readonly notifications: FalconNotificationsService) {}

  @Get()
  list(@Req() req: { user: AuthUser }, @Query('limit') limit?: string) {
    const take = Math.min(Number(limit) || 50, 100);
    return this.notifications.listForUser(req.user.user_id, take);
  }

  @Get('recent')
  recent(@Req() req: { user: AuthUser }) {
    return this.notifications.listRecent(req.user.user_id, 5);
  }

  @Get('unread-count')
  unreadCount(@Req() req: { user: AuthUser }) {
    return this.notifications.unreadCount(req.user.user_id).then((count) => ({ count }));
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @Req() req: { user: AuthUser }) {
    return this.notifications.markRead(id, req.user.user_id);
  }

  @Post('mark-all-read')
  markAllRead(@Req() req: { user: AuthUser }) {
    return this.notifications.markAllRead(req.user.user_id);
  }
}
