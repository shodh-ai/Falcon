import { Module } from '@nestjs/common';
import { CampusWalletController } from './campus-wallet.controller';
import { MessOrderController } from './mess-order.controller';
import { WalletController } from './wallet.controller';
import { CampusWalletService } from './campus-wallet.service';

@Module({
  controllers: [CampusWalletController, MessOrderController, WalletController],
  providers: [CampusWalletService],
  exports: [CampusWalletService],
})
export class CampusWalletModule {}
