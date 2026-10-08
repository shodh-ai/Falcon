import { Module } from '@nestjs/common';
import { SpecialProgramsController } from './special-programs.controller';
import { SpecialProgramsService } from './special-programs.service';

@Module({
  controllers: [SpecialProgramsController],
  providers: [SpecialProgramsService],
  exports: [SpecialProgramsService],
})
export class SpecialProgramsModule {}
