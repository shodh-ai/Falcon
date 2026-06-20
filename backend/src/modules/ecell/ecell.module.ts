import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { EcellController } from './ecell.controller';
import { EcellService } from './ecell.service';
import { EcellFounderService } from './ecell-founder.service';

@Module({
  imports: [FinanceModule, IntegrationsModule],
  controllers: [EcellController],
  providers: [EcellService, EcellFounderService],
  exports: [EcellService, EcellFounderService],
})
export class EcellModule {}
