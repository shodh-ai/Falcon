import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { HostelRoom } from '../../entities/hostel-room.entity';
import { GatePass } from '../../entities/gate-pass.entity';
import { LibraryBook } from '../../entities/library-book.entity';
import { TransportRoute } from '../../entities/transport-route.entity';
import { RequestGatePassDto } from './dto/request-gate-pass.dto';
import { CreateLibraryBookDto } from './dto/create-library-book.dto';
import { CreateTransportRouteDto } from './dto/create-transport-route.dto';

@Injectable()
export class OperationsService {
  constructor(
    @InjectRepository(HostelRoom) private rooms: Repository<HostelRoom>,
    @InjectRepository(GatePass) private gatePasses: Repository<GatePass>,
    @InjectRepository(LibraryBook) private books: Repository<LibraryBook>,
    @InjectRepository(TransportRoute) private routes: Repository<TransportRoute>,
  ) {}

  listRooms() {
    return this.rooms.find({ order: { hostel_block: 'ASC', room_number: 'ASC' } });
  }

  requestGatePass(dto: RequestGatePassDto) {
    const pass = this.gatePasses.create({
      ...dto,
      expected_exit_at: new Date(dto.expected_exit_at),
      expected_return_at: new Date(dto.expected_return_at),
      status: 'PENDING',
    });
    return this.gatePasses.save(pass);
  }

  async approveGatePass(passId: string, approverUserId: string) {
    const pass = await this.gatePasses.findOne({ where: { pass_id: passId } });
    if (!pass) throw new NotFoundException('Gate pass not found');
    pass.status = 'APPROVED';
    pass.approved_by_user_id = approverUserId;
    pass.qr_token = randomBytes(24).toString('hex');
    return this.gatePasses.save(pass);
  }

  listGatePasses(studentUserId?: string) {
    if (studentUserId) {
      return this.gatePasses.find({ where: { student_user_id: studentUserId }, order: { created_at: 'DESC' } });
    }
    return this.gatePasses.find({ order: { created_at: 'DESC' } });
  }

  listBooks() {
    return this.books.find({ order: { title: 'ASC' } });
  }

  createBook(dto: CreateLibraryBookDto) {
    const book = this.books.create({
      ...dto,
      available_copies: dto.total_copies ?? 1,
    });
    return this.books.save(book);
  }

  listRoutes() {
    return this.routes.find({ order: { route_code: 'ASC' } });
  }

  createRoute(dto: CreateTransportRouteDto) {
    return this.routes.save(this.routes.create(dto));
  }
}
