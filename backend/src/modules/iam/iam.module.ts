import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campus } from '../../entities/campus.entity';
import { School } from '../../entities/school.entity';
import { Program } from '../../entities/program.entity';
import { IamController } from './iam.controller';
import { IamService } from './iam.service';

@Module({
  imports: [TypeOrmModule.forFeature([Campus, School, Program])],
  controllers: [IamController],
  providers: [IamService],
  exports: [IamService],
})
export class IamModule {}
