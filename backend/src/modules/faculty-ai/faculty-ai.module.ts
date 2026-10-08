import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FacultyAiConversation } from '../../entities/faculty-ai-conversation.entity';
import { FacultyAiMessage } from '../../entities/faculty-ai-message.entity';
import { FacultyAiController } from './faculty-ai.controller';
import { FacultyAiService } from './faculty-ai.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([FacultyAiConversation, FacultyAiMessage]),
  ],
  controllers: [FacultyAiController],
  providers: [FacultyAiService],
  exports: [FacultyAiService],
})
export class FacultyAiModule {}
