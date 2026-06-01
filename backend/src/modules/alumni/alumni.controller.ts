import { Controller, Get } from '@nestjs/common';
import { AlumniService } from './alumni.service';

@Controller('api/alumni')
export class AlumniController {
  constructor(private readonly alumni: AlumniService) {}

  @Get('profiles')
  profiles() {
    return this.alumni.profiles();
  }

  @Get('donations')
  donations() {
    return this.alumni.donations();
  }

  @Get('events')
  events() {
    return this.alumni.events();
  }

  @Get('exit-clearance')
  exitClearance() {
    return this.alumni.exitClearance();
  }
}
