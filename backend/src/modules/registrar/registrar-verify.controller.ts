import { Controller, Get, Param } from '@nestjs/common';
import { RegistrarService } from './registrar.service';

/** Public certificate verification (no auth) — mirrors exam-cell transcript verify. */
@Controller('api/verify')
export class RegistrarVerifyController {
  constructor(private readonly registrar: RegistrarService) {}

  @Get('registrar-certificate/:code')
  verify(@Param('code') code: string) {
    return this.registrar.verifyCertificatePublic(code);
  }
}
