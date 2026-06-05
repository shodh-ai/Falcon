import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HostelRoom } from '../../entities/hostel-room.entity';
import { GatePass } from '../../entities/gate-pass.entity';
import { LibraryBook } from '../../entities/library-book.entity';
import { TransportRoute } from '../../entities/transport-route.entity';
import { HostelAllocation } from '../../entities/hostel-allocation.entity';
import { HostelRequest } from '../../entities/hostel-request.entity';
import { User } from '../../entities/user.entity';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';
import { HostelController } from './hostel.controller';
import { HostelService } from './hostel.service';
import { HostelAdminModule } from '../hostel-admin/hostel-admin.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([HostelRoom, GatePass, LibraryBook, TransportRoute, HostelAllocation, HostelRequest, User]),
    HostelAdminModule,
  ],
  controllers: [OperationsController, HostelController],
  providers: [OperationsService, HostelService],
  exports: [OperationsService, HostelService],
})
export class OperationsModule {}
