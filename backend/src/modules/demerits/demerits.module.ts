import { Module } from '@nestjs/common';
import { DemeritsController } from './demerits.controller';
import { FacultyDemeritsController } from './faculty-demerits.controller';
import { DemeritsService } from './demerits.service';

@Module({
  controllers: [DemeritsController, FacultyDemeritsController],
  providers: [DemeritsService],
  exports: [DemeritsService],
})
export class DemeritsModule {}
