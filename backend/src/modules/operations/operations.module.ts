import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HostelRoom } from '../../entities/hostel-room.entity';
import { GatePass } from '../../entities/gate-pass.entity';
import { LibraryBook } from '../../entities/library-book.entity';
import { TransportRoute } from '../../entities/transport-route.entity';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

@Module({
  imports: [TypeOrmModule.forFeature([HostelRoom, GatePass, LibraryBook, TransportRoute])],
  controllers: [OperationsController],
  providers: [OperationsService],
  exports: [OperationsService],
})
export class OperationsModule {}
