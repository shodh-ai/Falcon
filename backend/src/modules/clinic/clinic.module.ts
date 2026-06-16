import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { ClinicController } from './clinic.controller';
import { ClinicService } from './clinic.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [ClinicController],
  providers: [ClinicService],
})
export class ClinicModule {}
