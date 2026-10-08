import { Module } from '@nestjs/common';
import { AdmissionsModule } from '../admissions/admissions.module';
import { MasterDataModule } from '../master-data/master-data.module';
import { RegistrarController } from './registrar.controller';
import { RegistrarService } from './registrar.service';
import { RegistrarVerifyController } from './registrar-verify.controller';

@Module({
  imports: [MasterDataModule, AdmissionsModule],
  controllers: [RegistrarController, RegistrarVerifyController],
  providers: [RegistrarService],
  exports: [RegistrarService],
})
export class RegistrarModule {}
