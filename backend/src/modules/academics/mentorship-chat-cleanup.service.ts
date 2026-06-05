import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MentorshipChat } from '../../entities/mentorship-chat.entity';

@Injectable()
export class MentorshipChatCleanupService {
  private readonly logger = new Logger(MentorshipChatCleanupService.name);

  constructor(
    @InjectRepository(MentorshipChat)
    private readonly chatRepo: Repository<MentorshipChat>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async deleteOldChats() {
    this.logger.log('Running 7-Day Chat Cleanup Engine...');

    const result = await this.chatRepo
      .createQueryBuilder()
      .delete()
      .from(MentorshipChat)
      .where("sent_at < NOW() - INTERVAL '7 days'")
      .execute();

    this.logger.log(`Deleted ${result.affected ?? 0} old mentorship messages.`);
  }
}
