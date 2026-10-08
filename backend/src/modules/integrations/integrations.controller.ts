import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { IntegrationsService } from './integrations.service';
import { NotificationService } from './notification.service';
import { ChatbotAskDto } from './dto/chatbot-ask.dto';

@Controller('api/integrations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IntegrationsController {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly notifications: NotificationService,
  ) {}

  @Get('jobs')
  @Roles('SuperAdmin', 'Registrar')
  jobs() {
    return this.integrations.jobs();
  }

  @Post('government/push')
  @Roles('SuperAdmin', 'Registrar')
  governmentPush(
    @Body()
    dto: {
      type: 'DIGILOCKER' | 'NAD' | 'ABC';
      entity_type: string;
      entity_id?: string;
    },
  ) {
    return this.integrations.queueGovernmentPush(
      dto.type,
      dto.entity_type,
      dto.entity_id,
    );
  }

  @Post('whatsapp/send')
  @Roles('SuperAdmin', 'Registrar', 'Accountant')
  sendWhatsApp(@Body() dto: { to: string; message: string }) {
    return this.notifications.queueWhatsApp(dto.to, dto.message);
  }

  @Get('moodle/sso')
  @Roles('Student', 'Faculty', 'SuperAdmin')
  moodleSso(@Req() req: { user: { user_id: string; email: string } }) {
    return this.integrations.moodleSsoToken(req.user.user_id, req.user.email);
  }

  @Post('chatbot/ask')
  @Roles('Student', 'Applicant')
  chatbot(
    @Req() req: { user: { user_id: string; tenant_id?: string } },
    @Body() body: ChatbotAskDto,
  ) {
    return this.integrations.studentFaqChat(body.question, {
      userId: req.user.user_id,
      tenantId: req.user.tenant_id,
    });
  }

  @Post('alerts/attendance/run')
  @Roles('SuperAdmin')
  attendanceAlerts() {
    return this.notifications.checkAttendanceAlerts();
  }
}
