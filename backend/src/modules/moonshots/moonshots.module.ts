import { Module } from '@nestjs/common';
import { MoonshotsController } from './moonshots.controller';
import { MoonshotsService } from './moonshots.service';

@Module({
  controllers: [MoonshotsController],
  providers: [MoonshotsService],
  exports: [MoonshotsService],
})
export class MoonshotsModule {}
