import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { HostelAllocation } from '../../entities/hostel-allocation.entity';
import { HostelRequest } from '../../entities/hostel-request.entity';
import { HostelRoom } from '../../entities/hostel-room.entity';
import { User } from '../../entities/user.entity';
import { CreateHostelRequestDto } from './dto/create-hostel-request.dto';
import { WorkflowRoutingService } from '../../core/workflow/workflow-routing.service';
import { WorkflowNotificationService } from '../../core/workflow/workflow-notification.service';

@Injectable()
export class HostelService {
  constructor(
    @InjectRepository(HostelAllocation) private allocations: Repository<HostelAllocation>,
    @InjectRepository(HostelRequest) private requests: Repository<HostelRequest>,
    @InjectRepository(HostelRoom) private rooms: Repository<HostelRoom>,
    @InjectRepository(User) private users: Repository<User>,
    private readonly workflowRouting: WorkflowRoutingService,
    private readonly workflowNotify: WorkflowNotificationService,
  ) {}

  async getMyAllocation(studentUserId: string) {
    const allocation = await this.allocations.findOne({
      where: { student_user_id: studentUserId, status: 'ACTIVE' },
      order: { updated_at: 'DESC' },
    });
    if (!allocation) return null;

    const [room, warden] = await Promise.all([
      this.rooms.findOne({ where: { room_id: allocation.room_id } }),
      allocation.warden_user_id ? this.users.findOne({ where: { user_id: allocation.warden_user_id } }) : Promise.resolve(null),
    ]);

    return {
      allocation_id: allocation.allocation_id,
      hostel_block: room?.hostel_block ?? null,
      room_number: room?.room_number ?? null,
      bed_number: allocation.bed_number,
      mess_plan: allocation.mess_plan,
      start_date: allocation.start_date,
      end_date: allocation.end_date,
      status: allocation.status,
      warden: warden
        ? {
            user_id: warden.user_id,
            name: warden.name,
            email: warden.email,
          }
        : null,
    };
  }

  async createRequest(studentUserId: string, dto: CreateHostelRequestDto) {
    const isGatePass = dto.request_type === 'GATE_PASS';
    const payload = dto.payload ?? null;
    const student = await this.users.findOne({ where: { user_id: studentUserId } });
    const tenantId = student?.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';

    let wardenUserId: string | null = null;
    try {
      const warden = await this.workflowRouting.getWardenForStudent(studentUserId);
      wardenUserId = warden.userId;
    } catch {
      wardenUserId = null;
    }

    const saved = await this.requests.save(
      this.requests.create({
        student_user_id: studentUserId,
        request_type: dto.request_type,
        payload,
        remarks: dto.remarks ?? null,
        qr_token: isGatePass ? randomBytes(20).toString('hex') : null,
        warden_user_id: wardenUserId,
      } as Partial<HostelRequest>),
    );

    if (wardenUserId && student) {
      const warden = await this.workflowRouting.getWardenForStudent(studentUserId);
      const label =
        dto.request_type === 'MAINTENANCE'
          ? 'Hostel maintenance request'
          : dto.request_type === 'GATE_PASS'
            ? 'Hostel gate pass request'
            : `Hostel ${dto.request_type} request`;
      this.workflowNotify.notifyApprover({
        tenantId,
        approver: warden,
        title: label,
        message: `${student?.name ?? 'A student'} submitted: ${dto.remarks ?? dto.request_type}.`,
        actionLink: '/hostel-admin/requests',
        category: 'HOSTEL',
        requesterName: student?.name,
      });
    }

    return saved;
  }

  listMyRequests(studentUserId: string) {
    return this.requests.find({
      where: { student_user_id: studentUserId },
      order: { created_at: 'DESC' },
    });
  }
}
