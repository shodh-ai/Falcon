import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { AcademicRndController } from './academic-rnd.controller';
import { AcademicRndService } from './academic-rnd.service';

@Module({
  imports: [IntegrationsModule],
  controllers: [AcademicRndController],
  providers: [AcademicRndService],
  exports: [AcademicRndService],
})
export class AcademicRndModule {}
