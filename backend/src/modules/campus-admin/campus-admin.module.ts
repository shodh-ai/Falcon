import { Module } from '@nestjs/common';
import { CampusAdminController } from './campus-admin.controller';
import { CampusAdminService } from './campus-admin.service';
import { SuperAdminModule } from '../super-admin/super-admin.module';

@Module({
  imports: [SuperAdminModule],
  controllers: [CampusAdminController],
  providers: [CampusAdminService],
})
export class CampusAdminModule {}
