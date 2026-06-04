import { Module } from '@nestjs/common';
import { CampusWalletController } from './campus-wallet.controller';
import { CampusWalletService } from './campus-wallet.service';

@Module({
  controllers: [CampusWalletController],
  providers: [CampusWalletService],
  exports: [CampusWalletService],
})
export class CampusWalletModule {}
