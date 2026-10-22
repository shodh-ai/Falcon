import { Controller, Get, Header, Param } from '@nestjs/common';
import { OfficialTranscriptService } from './official-transcript.service';

@Controller('api/verify')
export class TranscriptVerifyController {
  constructor(private readonly transcripts: OfficialTranscriptService) {}

  @Get('transcript/:code')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  verify(@Param('code') code: string) {
    return this.transcripts.verifyPublic(code);
  }
}
