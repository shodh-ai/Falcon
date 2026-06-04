import { Module } from '@nestjs/common';
import { LmsExtendedController } from './lms-extended.controller';
import { LmsExtendedService } from './lms-extended.service';

@Module({
  controllers: [LmsExtendedController],
  providers: [LmsExtendedService],
  exports: [LmsExtendedService],
})
export class LmsExtendedModule {}
