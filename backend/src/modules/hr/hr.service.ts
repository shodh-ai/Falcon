import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeaveRequest, LeaveRequestStatus } from '../../entities/leave-request.entity';
import { LeaveBalance } from '../../entities/leave-balance.entity';
import { StaffAttendance } from '../../entities/staff-attendance.entity';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { LeaveActionDto } from './dto/leave-action.dto';

type ApprovalStep = 'PENDING_HOD' | 'PENDING_DEAN' | 'PENDING_HR';

const APPROVAL_FLOW: Record<ApprovalStep, LeaveRequestStatus> = {
  PENDING_HOD: 'PENDING_DEAN',
  PENDING_DEAN: 'PENDING_HR',
  PENDING_HR: 'APPROVED',
};

@Injectable()
export class HrService {
  constructor(
    @InjectRepository(LeaveRequest) private leaves: Repository<LeaveRequest>,
    @InjectRepository(LeaveBalance) private balances: Repository<LeaveBalance>,
    @InjectRepository(StaffAttendance) private staffAttendance: Repository<StaffAttendance>,
  ) {}

  createLeaveRequest(dto: CreateLeaveRequestDto) {
    const entity = this.leaves.create({
      ...dto,
      status: 'PENDING_HOD',
      approval_trail: { history: [] },
    });
    return this.leaves.save(entity);
  }

  listLeaveRequests(userId?: string, status?: LeaveRequestStatus) {
    const where: Record<string, unknown> = {};
    if (userId) where.requester_user_id = userId;
    if (status) where.status = status;
    return this.leaves.find({ where, order: { created_at: 'DESC' } });
  }

  async actOnLeave(leaveId: string, dto: LeaveActionDto) {
    const leave = await this.leaves.findOne({ where: { leave_request_id: leaveId } });
    if (!leave) throw new NotFoundException('Leave request not found');

    if (!(leave.status in APPROVAL_FLOW)) {
      throw new BadRequestException(`Cannot act on leave in status ${leave.status}`);
    }

    const trail = (leave.approval_trail as { history?: unknown[] }) ?? { history: [] };
    const history = Array.isArray(trail.history) ? trail.history : [];
    history.push({
      step: leave.status,
      action: dto.action,
      actor_user_id: dto.actor_user_id,
      comment: dto.comment ?? null,
      at: new Date().toISOString(),
    });

    leave.status =
      dto.action === 'REJECT'
        ? 'REJECTED'
        : APPROVAL_FLOW[leave.status as ApprovalStep];
    leave.approval_trail = { history };
    return this.leaves.save(leave);
  }

  listBalances(userId: string) {
    return this.balances.find({ where: { user_id: userId } });
  }

  recordStaffAttendance(userId: string, workDate: string) {
    const row = this.staffAttendance.create({
      user_id: userId,
      work_date: workDate,
      check_in_at: new Date(),
      status: 'PRESENT',
      source: 'MANUAL',
    });
    return this.staffAttendance.save(row);
  }
}
