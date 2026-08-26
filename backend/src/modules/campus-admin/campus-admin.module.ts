import { Module } from '@nestjs/common';
import { CampusAdminController } from './campus-admin.controller';
import { CampusAdminService } from './campus-admin.service';
import { SuperAdminModule } from '../super-admin/super-admin.module';
import { HelpdeskModule } from '../helpdesk/helpdesk.module';
import { AdminControlModule } from '../admin-control/admin-control.module';

@Module({
  imports: [SuperAdminModule, HelpdeskModule, AdminControlModule],
  controllers: [CampusAdminController],
  providers: [CampusAdminService],
})
export class CampusAdminModule {}
