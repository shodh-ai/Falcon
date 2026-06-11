import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FalconNotification } from '../../entities/falcon-notification.entity';
import { User } from '../../entities/user.entity';
import { ClinicController } from './clinic.controller';
import { ClinicService } from './clinic.service';

@Module({
  imports: [TypeOrmModule.forFeature([FalconNotification, User])],
  controllers: [ClinicController],
  providers: [ClinicService],
})
export class ClinicModule {}
