import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AcademicMentorship } from '../../entities/academic-mentorship.entity';
import { StudentProfile } from '../../entities/student-profile.entity';
import { ProctorInteraction } from '../../entities/proctor-interaction.entity';
import { User } from '../../entities/user.entity';
import { StudentCertificate } from '../../entities/student-certificate.entity';
import { AssignMentorDto } from './dto/assign-mentor.dto';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { WorkflowRoutingService } from '../../core/workflow/workflow-routing.service';
import { WorkflowNotificationService } from '../../core/workflow/workflow-notification.service';

@Injectable()
export class ProctorService {
  constructor(
    @InjectRepository(AcademicMentorship) private mentorships: Repository<AcademicMentorship>,
    @InjectRepository(StudentProfile) private profiles: Repository<StudentProfile>,
    @InjectRepository(ProctorInteraction) private interactions: Repository<ProctorInteraction>,
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(StudentCertificate)
    private certificates: Repository<StudentCertificate>,
    private readonly notify: NotificationEmitterService,
    private readonly workflowRouting: WorkflowRoutingService,
    private readonly workflowNotify: WorkflowNotificationService,
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

    const student = await this.users.findOne({ where: { user_id: studentUserId } });
    const saved = await this.interactions.save(
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

    if (student?.tenant_id) {
      const approver = await this.workflowRouting.getStudentProctor(studentUserId);
      this.workflowNotify.notifyApprover({
        tenantId: student.tenant_id,
        approver,
        title: 'Proctor meeting requested',
        message: `${student.name} requested a meeting on ${meetingAt}.${note ? ` Note: ${note}` : ''}`,
        actionLink: '/faculty/mentorship',
        category: 'ACADEMICS',
        requesterName: student.name,
      });
    }

    return saved;
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

  async getPendingApprovals(proctorUserId: string, tenantId: string) {
    const mentorships = await this.mentorships.find({
      where: { proctor_user_id: proctorUserId, is_active: true },
      relations: ['student'],
    });
    const studentIds = mentorships.map((m) => m.student_user_id);
    if (studentIds.length === 0) {
      return { certificates: [] };
    }

    const certificates = await this.certificates
      .createQueryBuilder('certificate')
      .leftJoinAndSelect('certificate.student', 'student')
      .where('certificate.tenant_id = :tenantId', { tenantId })
      .andWhere('certificate.verification_status = :status', { status: 'PENDING' })
      .andWhere('certificate.student_user_id IN (:...studentIds)', { studentIds })
      .orderBy('certificate.uploaded_at', 'DESC')
      .getMany();

    return {
      certificates: certificates.map((certificate) => ({
        certificate_id: certificate.certificate_id,
        title: certificate.title,
        issuer: certificate.issuer,
        issue_date: certificate.issue_date,
        uploaded_at: certificate.uploaded_at,
        student: certificate.student
          ? {
              user_id: certificate.student.user_id,
              name: certificate.student.name,
              email: certificate.student.email,
            }
          : null,
      })),
    };
  }

  async approveCertificate(
    proctorUserId: string,
    tenantId: string,
    certificateId: string,
    status: 'VERIFIED' | 'REJECTED' = 'VERIFIED',
    rejectionReason?: string,
  ) {
    const certificate = await this.certificates.findOne({
      where: { certificate_id: certificateId, tenant_id: tenantId },
    });
    if (!certificate) throw new NotFoundException('Certificate not found');

    const mentorship = await this.mentorships.findOne({
      where: {
        student_user_id: certificate.student_user_id,
        proctor_user_id: proctorUserId,
        is_active: true,
      },
    });
    if (!mentorship) throw new ForbiddenException('Certificate is not assigned to your mentee');

    certificate.verification_status = status;
    certificate.verified_by_user_id = proctorUserId;
    certificate.verified_at = new Date();
    certificate.rejection_reason = status === 'REJECTED' ? rejectionReason ?? null : null;
    return this.certificates.save(certificate);
  }

}
