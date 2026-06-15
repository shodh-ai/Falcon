import { Module } from '@nestjs/common';
import { FinancialGeminiService } from './financial-gemini.service';
import { LeadershipAiController } from './leadership-ai.controller';

@Module({
  controllers: [LeadershipAiController],
  providers: [FinancialGeminiService],
  exports: [FinancialGeminiService],
})
export class LeadershipAiModule {}
