import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { IntegrationsService } from './integrations.service';
import { NotificationService } from './notification.service';

@Controller('api/integrations')
export class IntegrationsController {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly notifications: NotificationService,
  ) {}

  @Get('jobs')
  @UseGuards(JwtAuthGuard)
  @Roles('SuperAdmin', 'Registrar')
  jobs() {
    return this.integrations.jobs();
  }

  @Post('government/push')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  @Roles('SuperAdmin', 'Registrar', 'Accountant')
  sendWhatsApp(@Body() dto: { to: string; message: string }) {
    return this.notifications.queueWhatsApp(dto.to, dto.message);
  }

  @Get('moodle/sso')
  @UseGuards(JwtAuthGuard)
  @Roles('Student', 'Faculty', 'SuperAdmin')
  moodleSso(@Req() req: { user: { user_id: string; email: string } }) {
    return this.integrations.moodleSsoToken(req.user.user_id, req.user.email);
  }

  @Post('chatbot/ask')
  @UseGuards(JwtAuthGuard)
  @Roles('Student', 'Applicant')
  chatbot(@Body('question') question: string) {
    return this.integrations.studentFaqChat(question);
  }

  @Post('alerts/attendance/run')
  @UseGuards(JwtAuthGuard)
  @Roles('SuperAdmin')
  attendanceAlerts() {
    return this.notifications.checkAttendanceAlerts();
  }
}
