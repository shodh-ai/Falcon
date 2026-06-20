import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { WorkflowRoutingService } from '../../core/workflow/workflow-routing.service';
import { WorkflowNotificationService } from '../../core/workflow/workflow-notification.service';
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
    @InjectRepository(TransportRoute)
    private routes: Repository<TransportRoute>,
    private readonly notify: NotificationEmitterService,
    private readonly workflowRouting: WorkflowRoutingService,
    private readonly workflowNotify: WorkflowNotificationService,
  ) {}

  private async resolveStudentTenant(studentUserId: string): Promise<string> {
    const user = await this.gatePasses.manager.query<
      Array<{ tenant_id: string }>
    >(`SELECT tenant_id FROM users WHERE user_id = $1 LIMIT 1`, [
      studentUserId,
    ]);
    return user[0]?.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  listRooms() {
    return this.rooms.find({
      order: { hostel_block: 'ASC', room_number: 'ASC' },
    });
  }

  async requestGatePass(dto: RequestGatePassDto) {
    const pass = this.gatePasses.create({
      ...dto,
      expected_exit_at: new Date(dto.expected_exit_at),
      expected_return_at: new Date(dto.expected_return_at),
      status: 'PENDING',
    });
    const saved = await this.gatePasses.save(pass);

    try {
      const tenantId = await this.resolveStudentTenant(saved.student_user_id);
      const warden = await this.workflowRouting.getWardenForStudent(
        saved.student_user_id,
      );
      const student = await this.gatePasses.manager.query<
        Array<{ name: string }>
      >(`SELECT name FROM users WHERE user_id = $1`, [saved.student_user_id]);
      this.workflowNotify.notifyApprover({
        tenantId,
        approver: warden,
        title: 'Gate pass approval required',
        message: `${student[0]?.name ?? 'Student'} requested a campus gate pass.`,
        actionLink: '/hostel-admin/gate-passes',
        category: 'HOSTEL',
        requesterName: student[0]?.name,
      });
    } catch {
      /* student may not have hostel allocation — warden routing optional */
    }

    return saved;
  }

  async approveGatePass(passId: string, approverUserId: string) {
    const pass = await this.gatePasses.findOne({ where: { pass_id: passId } });
    if (!pass) throw new NotFoundException('Gate pass not found');
    pass.status = 'APPROVED';
    pass.approved_by_user_id = approverUserId;
    pass.qr_token = randomBytes(24).toString('hex');
    const saved = await this.gatePasses.save(pass);
    const tenantId = await this.resolveStudentTenant(saved.student_user_id);
    this.notify.gatePassUpdated({
      tenantId,
      userId: saved.student_user_id,
      status: 'APPROVED',
    });
    return saved;
  }

  async rejectGatePass(passId: string, approverUserId: string) {
    const pass = await this.gatePasses.findOne({ where: { pass_id: passId } });
    if (!pass) throw new NotFoundException('Gate pass not found');
    pass.status = 'REJECTED';
    pass.approved_by_user_id = approverUserId;
    const saved = await this.gatePasses.save(pass);
    const tenantId = await this.resolveStudentTenant(saved.student_user_id);
    this.notify.gatePassUpdated({
      tenantId,
      userId: saved.student_user_id,
      status: 'REJECTED',
    });
    return saved;
  }

  listGatePasses(studentUserId?: string) {
    if (studentUserId) {
      return this.gatePasses.find({
        where: { student_user_id: studentUserId },
        order: { created_at: 'DESC' },
      });
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
