import { Body, Controller, Get, Post } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';

@Controller('api/integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get('jobs')
  jobs() {
    return this.integrations.jobs();
  }

  @Post('government/push')
  governmentPush(@Body() dto: { type: 'DIGILOCKER' | 'NAD' | 'ABC'; entity_type: string; entity_id?: string }) {
    return this.integrations.queueGovernmentPush(dto.type, dto.entity_type, dto.entity_id);
  }

  @Post('whatsapp/send')
  sendWhatsApp(@Body() dto: { to: string; message: string }) {
    return this.integrations.sendWhatsApp(dto.to, dto.message);
  }
}
