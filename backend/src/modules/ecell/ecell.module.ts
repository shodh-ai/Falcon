import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { AttendancePolicyModule } from '../attendance-policy/attendance-policy.module';
import { EcellController } from './ecell.controller';
import { EcellService } from './ecell.service';
import { EcellFounderService } from './ecell-founder.service';
import { EcellUropService } from './ecell-urop.service';

@Module({
  imports: [FinanceModule, IntegrationsModule, AttendancePolicyModule],
  controllers: [EcellController],
  providers: [EcellService, EcellFounderService, EcellUropService],
  exports: [EcellService, EcellFounderService, EcellUropService],
})
export class EcellModule {}
