import {
  Controller,
  Delete,
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
import { OnboardingVerificationNotifyService } from './onboarding-verification-notify.service';

type AuthUser = { user_id: string; tenant_id?: string };

@Controller(['notifications', 'api/notifications'])
@UseGuards(JwtAuthGuard)
export class FalconNotificationsController {
  constructor(
    private readonly notifications: FalconNotificationsService,
    private readonly onboardingVerificationNotify: OnboardingVerificationNotifyService,
  ) {}

  private ctx(req: { user: AuthUser }) {
    return {
      tenantId: req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001',
      userId: req.user.user_id,
    };
  }

  @Get()
  async list(@Req() req: { user: AuthUser }, @Query('limit') limit?: string) {
    const { tenantId, userId } = this.ctx(req);
    await this.onboardingVerificationNotify
      .dismissStaleVerificationNotifications(tenantId)
      .catch(() => undefined);
    return this.notifications.listForUser(
      tenantId,
      userId,
      this.notifications.clampLimit(Number(limit)),
    );
  }

  @Get('recent')
  async recent(@Req() req: { user: AuthUser }) {
    const { tenantId, userId } = this.ctx(req);
    await this.onboardingVerificationNotify
      .dismissStaleVerificationNotifications(tenantId)
      .catch(() => undefined);
    return this.notifications.listRecent(tenantId, userId, 8);
  }

  @Get('unread-count')
  async unreadCount(@Req() req: { user: AuthUser }) {
    const { tenantId, userId } = this.ctx(req);
    await this.onboardingVerificationNotify
      .dismissStaleVerificationNotifications(tenantId)
      .catch(() => undefined);
    const count = await this.notifications.unreadCount(tenantId, userId);
    return { count };
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

  @Patch(':id/dismiss')
  dismissPatch(@Param('id') id: string, @Req() req: { user: AuthUser }) {
    const { tenantId, userId } = this.ctx(req);
    return this.notifications.dismiss(id, tenantId, userId);
  }

  @Delete(':id')
  dismiss(@Param('id') id: string, @Req() req: { user: AuthUser }) {
    const { tenantId, userId } = this.ctx(req);
    return this.notifications.dismiss(id, tenantId, userId);
  }
}
