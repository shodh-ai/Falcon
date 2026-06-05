import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AcademicMentorship } from '../../entities/academic-mentorship.entity';
import { MentorshipChat, MentorshipChatSender } from '../../entities/mentorship-chat.entity';
import { User } from '../../entities/user.entity';

@Injectable()
export class MentorshipChatService {
  constructor(
    @InjectRepository(MentorshipChat) private readonly chats: Repository<MentorshipChat>,
    @InjectRepository(AcademicMentorship) private readonly mentorships: Repository<AcademicMentorship>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async sendStudentMessage(studentUserId: string, message: string) {
    const mentorship = await this.requireActiveMentorship(studentUserId);
    return this.insertMessage(
      studentUserId,
      mentorship.proctor_user_id,
      'STUDENT',
      message,
    );
  }

  async sendFacultyMessage(proctorUserId: string, studentUserId: string, message: string) {
    const mentorship = await this.mentorships.findOne({
      where: {
        student_user_id: studentUserId,
        proctor_user_id: proctorUserId,
        is_active: true,
      },
    });
    if (!mentorship) throw new ForbiddenException('This student is not your mentee');

    return this.insertMessage(studentUserId, proctorUserId, 'FACULTY', message);
  }

  async listMenteesWithChatSummary(proctorUserId: string) {
    const mentorships = await this.mentorships.find({
      where: { proctor_user_id: proctorUserId, is_active: true },
      relations: ['student'],
      order: { created_at: 'DESC' },
    });

    const summaries = await Promise.all(
      mentorships.map(async (m) => {
        const unread = await this.chats.count({
          where: {
            student_user_id: m.student_user_id,
            proctor_user_id: proctorUserId,
            sender_type: 'STUDENT',
            is_read: false,
          },
        });
        const last = await this.chats.findOne({
          where: {
            student_user_id: m.student_user_id,
            proctor_user_id: proctorUserId,
          },
          order: { sent_at: 'DESC' },
        });
        return {
          student_user_id: m.student_user_id,
          student_name: m.student?.name ?? 'Student',
          student_email: m.student?.email ?? null,
          unread_count: unread,
          last_message_at: last?.sent_at ?? null,
          last_message_preview: last?.message_text?.slice(0, 80) ?? null,
        };
      }),
    );

    return summaries.sort((a, b) => {
      const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return bTime - aTime;
    });
  }

  async getThread(proctorUserId: string, studentUserId: string, markRead: boolean) {
    await this.assertMentorshipPair(studentUserId, proctorUserId);

    const rows = await this.chats.find({
      where: { student_user_id: studentUserId, proctor_user_id: proctorUserId },
      order: { sent_at: 'ASC' },
    });

    if (markRead) {
      await this.chats.update(
        {
          student_user_id: studentUserId,
          proctor_user_id: proctorUserId,
          sender_type: 'STUDENT',
          is_read: false,
        },
        { is_read: true },
      );
    }

    return rows.map((row) => this.mapMessage(row));
  }

  async getStudentThread(studentUserId: string) {
    const mentorship = await this.requireActiveMentorship(studentUserId);
    const rows = await this.chats.find({
      where: {
        student_user_id: studentUserId,
        proctor_user_id: mentorship.proctor_user_id,
      },
      order: { sent_at: 'ASC' },
    });
    return rows.map((row) => this.mapMessage(row));
  }

  private async insertMessage(
    studentUserId: string,
    proctorUserId: string,
    senderType: MentorshipChatSender,
    rawMessage: string,
  ) {
    const trimmed = rawMessage.trim();
    if (!trimmed) throw new BadRequestException('Message cannot be empty');

    const saved = await this.chats.save(
      this.chats.create({
        student_user_id: studentUserId,
        proctor_user_id: proctorUserId,
        sender_type: senderType,
        message_text: trimmed,
        is_read: senderType === 'FACULTY',
      }),
    );

    return this.mapMessage(saved);
  }

  private async requireActiveMentorship(studentUserId: string) {
    const mentorship = await this.mentorships.findOne({
      where: { student_user_id: studentUserId, is_active: true },
    });
    if (!mentorship) throw new NotFoundException('No active mentor assigned');
    return mentorship;
  }

  private async assertMentorshipPair(studentUserId: string, proctorUserId: string) {
    const mentorship = await this.mentorships.findOne({
      where: {
        student_user_id: studentUserId,
        proctor_user_id: proctorUserId,
        is_active: true,
      },
    });
    if (!mentorship) throw new ForbiddenException('Not an active mentorship pair');
  }

  private mapMessage(row: MentorshipChat) {
    return {
      message_id: row.message_id,
      student_user_id: row.student_user_id,
      proctor_user_id: row.proctor_user_id,
      sender_type: row.sender_type,
      message_text: row.message_text,
      is_read: row.is_read,
      sent_at: row.sent_at,
    };
  }
}
