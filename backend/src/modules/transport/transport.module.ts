import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { TransportController } from './transport.controller';
import { TransportService } from './transport.service';
import { TransportGateway } from './transport.gateway';
import { ScopedSocketModule } from '../../common/websockets/scoped-socket.module';

@Module({
  imports: [FinanceModule, ScopedSocketModule],
  controllers: [TransportController],
  providers: [TransportService, TransportGateway],
  exports: [TransportService, TransportGateway],
})
export class TransportModule {}
