import { Controller, Get, Param } from '@nestjs/common';
import { OfficialTranscriptService } from './official-transcript.service';

@Controller('api/verify')
export class TranscriptVerifyController {
  constructor(private readonly transcripts: OfficialTranscriptService) {}

  @Get('transcript/:code')
  verify(@Param('code') code: string) {
    return this.transcripts.verifyPublic(code);
  }
}
