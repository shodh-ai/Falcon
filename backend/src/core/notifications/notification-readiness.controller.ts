import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/roles.decorator';
import { NotificationReadinessService } from './notification-readiness.service';

@Controller('health/notifications')
export class NotificationReadinessController {
  constructor(private readonly readiness: NotificationReadinessService) {}

  @Public()
  @Get()
  health() {
    return this.readiness.check();
  }
}
