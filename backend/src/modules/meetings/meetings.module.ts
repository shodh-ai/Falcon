import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { PortalMeeting } from '../../entities/portal-meeting.entity';
import { PortalMeetingParticipant } from '../../entities/portal-meeting-participant.entity';
import { PortalMeetingMinutes } from '../../entities/portal-meeting-minutes.entity';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      PortalMeeting,
      PortalMeetingParticipant,
      PortalMeetingMinutes,
    ]),
  ],
  controllers: [MeetingsController],
  providers: [MeetingsService],
  exports: [MeetingsService],
})
export class MeetingsModule {}
