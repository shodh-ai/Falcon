import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HandoverLog } from '../entities/handover-log.entity';
import { TaskAssignment } from '../entities/task-assignment.entity';
import { User } from '../entities/user.entity';
import { CreateHandoverDto } from './dto/create-handover.dto';

@Injectable()
export class HandoverService {
  constructor(
    @InjectRepository(HandoverLog)
    private handoverLogRepository: Repository<HandoverLog>,
    @InjectRepository(TaskAssignment)
    private taskAssignmentRepository: Repository<TaskAssignment>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async performHandover(
    createHandoverDto: CreateHandoverDto,
    performedBy: string,
  ): Promise<HandoverLog> {
    const {
      from_user: fromUserId,
      to_user: toUserId,
      notes,
    } = createHandoverDto;

    if (fromUserId === toUserId) {
      throw new BadRequestException(
        'Outgoing and replacement users must be different',
      );
    }

    // Validate users
    const fromUser = await this.userRepository.findOne({
      where: { user_id: fromUserId },
      relations: ['role', 'department'],
    });

    const toUser = await this.userRepository.findOne({
      where: { user_id: toUserId },
      relations: ['role', 'department'],
    });

    if (!fromUser) {
      throw new NotFoundException(`User with ID ${fromUserId} not found`);
    }

    if (!toUser) {
      throw new NotFoundException(`User with ID ${toUserId} not found`);
    }

    if (!toUser.is_active) {
      throw new BadRequestException('Replacement user must be active');
    }

    // Check if roles match
    if (fromUser.role_id !== toUser.role_id) {
      throw new BadRequestException(
        'Users must have the same role for handover',
      );
    }

    // Deactivate from_user
    fromUser.is_active = false;
    await this.userRepository.save(fromUser);

    // Transfer all pending task assignments
    const pendingAssignments = await this.taskAssignmentRepository.find({
      where: { assigned_to: fromUserId, status: 'Pending' },
    });

    for (const assignment of pendingAssignments) {
      assignment.assigned_to = toUserId;
      await this.taskAssignmentRepository.save(assignment);
    }

    // Log the handover
    const handoverLog = this.handoverLogRepository.create({
      from_user: fromUserId,
      to_user: toUserId,
      performed_by: performedBy,
      notes,
    });

    return this.handoverLogRepository.save(handoverLog);
  }

  async getHandoverHistory(userId?: string): Promise<HandoverLog[]> {
    const queryBuilder = this.handoverLogRepository
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.from_user_entity', 'fromUser')
      .leftJoinAndSelect('log.to_user_entity', 'toUser')
      .leftJoinAndSelect('log.performed_by_entity', 'performedBy')
      .orderBy('log.handover_date', 'DESC');

    if (userId) {
      queryBuilder.andWhere(
        '(log.from_user = :userId OR log.to_user = :userId OR log.performed_by = :userId)',
        { userId },
      );
    }

    return queryBuilder.getMany();
  }

  async getHandoverLog(handoverId: string): Promise<HandoverLog> {
    const handoverLog = await this.handoverLogRepository.findOne({
      where: { handover_id: handoverId },
      relations: ['from_user_entity', 'to_user_entity', 'performed_by_entity'],
    });

    if (!handoverLog) {
      throw new NotFoundException(
        `Handover log with ID ${handoverId} not found`,
      );
    }

    return handoverLog;
  }
}
