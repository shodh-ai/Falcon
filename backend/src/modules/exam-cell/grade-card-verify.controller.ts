import { Controller, Get, Header, Param } from '@nestjs/common';
import { GradeCardVerificationService } from './grade-card-verification.service';

@Controller('api/verify')
export class GradeCardVerifyController {
  constructor(private readonly verification: GradeCardVerificationService) {}

  @Get('grade-card/:token')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  verify(@Param('token') token: string) {
    return this.verification.verifyPublic(token);
  }
}
