import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '../../core/redis/redis.module';
import { FalconNotification } from '../../entities/falcon-notification.entity';
import { User } from '../../entities/user.entity';
import { LeadershipController } from './leadership.controller';
import { LeadershipService } from './leadership.service';

@Module({
  imports: [TypeOrmModule.forFeature([FalconNotification, User]), RedisModule],
  controllers: [LeadershipController],
  providers: [LeadershipService],
  exports: [LeadershipService],
})
export class LeadershipModule {}
