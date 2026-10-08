import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** Liveness probe — unauthenticated (matches integration mock). */
  @Get('health')
  health() {
    return { status: 'ok' };
  }

  /** Alias used by frontend / ops tooling. */
  @Get('api/health')
  apiHealth() {
    return { status: 'ok' };
  }

  @Get('api/ping')
  ping() {
    return { pong: true };
  }
}
