import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AcademicMentorship } from '../../entities/academic-mentorship.entity';
import { StudentProfile } from '../../entities/student-profile.entity';
import { ProctorInteraction } from '../../entities/proctor-interaction.entity';
import { User } from '../../entities/user.entity';
import { AssignMentorDto } from './dto/assign-mentor.dto';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';

@Injectable()
export class ProctorService {
  constructor(
    @InjectRepository(AcademicMentorship) private mentorships: Repository<AcademicMentorship>,
    @InjectRepository(StudentProfile) private profiles: Repository<StudentProfile>,
    @InjectRepository(ProctorInteraction) private interactions: Repository<ProctorInteraction>,
    @InjectRepository(User) private users: Repository<User>,
  ) {}

  async assignMentor(dto: AssignMentorDto, assignedByUserId: string) {
    const assignment = this.mentorships.create({
      ...dto,
      assigned_by_user_id: assignedByUserId,
      is_active: true,
    });
    return this.mentorships.save(assignment);
  }

  async getAssignedProctor(studentUserId: string) {
    const mentorship = await this.mentorships.findOne({
      where: { student_user_id: studentUserId, is_active: true },
      order: { updated_at: 'DESC' },
    });
    if (!mentorship) return null;

    const proctor = await this.users.findOne({
      where: { user_id: mentorship.proctor_user_id },
      relations: ['department'],
    });
    if (!proctor) throw new NotFoundException('Assigned proctor not found');

    return {
      mentorship_id: mentorship.mentorship_id,
      assigned_at: mentorship.created_at,
      proctor: {
        user_id: proctor.user_id,
        name: proctor.name,
        email: proctor.email,
        dept_id: proctor.dept_id,
        department: proctor.department?.dept_name ?? null,
      },
    };
  }

  async getStudentProfile(userId: string) {
    let profile = await this.profiles.findOne({ where: { user_id: userId } });
    if (!profile) {
      profile = await this.profiles.save(this.profiles.create({ user_id: userId }));
    }
    return profile;
  }

  async updateStudentProfile(actorUserId: string, targetUserId: string, dto: UpdateStudentProfileDto) {
    if (actorUserId !== targetUserId) {
      throw new ForbiddenException('Students can only update their own profile');
    }

    const profile = await this.getStudentProfile(targetUserId);

    if (dto.enrollment_no !== undefined) profile.enrollment_no = dto.enrollment_no;
    if (dto.batch !== undefined) profile.batch = dto.batch;
    if (dto.blood_group !== undefined) profile.blood_group = dto.blood_group;
    if (dto.parent_info !== undefined) profile.parent_info = dto.parent_info;

    return this.profiles.save(profile);
  }

  async bookMeeting(studentUserId: string, meetingAt: string, note?: string) {
    const mentorship = await this.mentorships.findOne({ where: { student_user_id: studentUserId, is_active: true } });
    if (!mentorship) throw new NotFoundException('No active proctor assigned');

    return this.interactions.save(
      this.interactions.create({
        student_user_id: studentUserId,
        proctor_user_id: mentorship.proctor_user_id,
        interaction_type: 'MEETING',
        payload: {
          meeting_at: meetingAt,
          note: note ?? '',
        },
        status: 'REQUESTED',
      }),
    );
  }

  async sendMessage(studentUserId: string, message: string) {
    const mentorship = await this.mentorships.findOne({ where: { student_user_id: studentUserId, is_active: true } });
    if (!mentorship) throw new NotFoundException('No active proctor assigned');

    return this.interactions.save(
      this.interactions.create({
        student_user_id: studentUserId,
        proctor_user_id: mentorship.proctor_user_id,
        interaction_type: 'MESSAGE',
        payload: { message },
        status: 'SENT',
      }),
    );
  }

  async getMyAssignedStudents(proctorUserId: string) {
    const mentorships = await this.mentorships.find({
      where: { proctor_user_id: proctorUserId, is_active: true },
      relations: ['student'],
      order: { created_at: 'DESC' },
    });
    return mentorships.map(m => ({
      mentorship_id: m.mentorship_id,
      student: {
        user_id: m.student?.user_id,
        name: m.student?.name,
        email: m.student?.email,
      },
    }));
  }

}
