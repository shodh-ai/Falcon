import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { TransportController } from './transport.controller';
import { TransportService } from './transport.service';
import { TransportGateway } from './transport.gateway';

@Module({
  imports: [FinanceModule],
  controllers: [TransportController],
  providers: [TransportService, TransportGateway],
  exports: [TransportService, TransportGateway],
})
export class TransportModule {}
