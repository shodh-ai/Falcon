import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AcademicMentorship } from '../../entities/academic-mentorship.entity';
import { User } from '../../entities/user.entity';
import { HostelAllocation } from '../../entities/hostel-allocation.entity';
import { HostelRoom } from '../../entities/hostel-room.entity';
import { Role } from '../../entities/role.entity';
import type { HelpdeskTicketCategory } from '../../entities/helpdesk-ticket.entity';

export type RoutedApprover = {
  userId: string;
  email: string;
  name: string;
  routeReason: string;
};

@Injectable()
export class WorkflowRoutingService {
  private readonly hrAdminEmail =
    process.env.WORKFLOW_HR_ADMIN_EMAIL ?? 'hr.admin@mygyanvihar.com';
  private readonly financeAdminEmail =
    process.env.WORKFLOW_FINANCE_ADMIN_EMAIL ?? 'finance@mygyanvihar.com';
  private readonly itAdminEmail =
    process.env.WORKFLOW_IT_ADMIN_EMAIL ?? 'iqac@mygyanvihar.com';
  private readonly fallbackHodEmail =
    process.env.WORKFLOW_HOD_FALLBACK_EMAIL ?? 'hod@mygyanvihar.com';
  private readonly fallbackRegistrarEmail =
    process.env.WORKFLOW_REGISTRAR_EMAIL ?? 'registrar@mygyanvihar.com';

  constructor(
    @InjectRepository(AcademicMentorship)
    private readonly mentorships: Repository<AcademicMentorship>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(HostelAllocation)
    private readonly hostelAllocations: Repository<HostelAllocation>,
    @InjectRepository(HostelRoom) private readonly hostelRooms: Repository<HostelRoom>,
    @InjectRepository(Role) private readonly roles: Repository<Role>,
  ) {}

  /** Active proctor for a student (academic_mentorships.is_active). */
  async getStudentProctor(studentUserId: string): Promise<RoutedApprover> {
    const mapping = await this.mentorships.findOne({
      where: { student_user_id: studentUserId, is_active: true },
      relations: ['proctor'],
    });
    if (!mapping?.proctor_user_id) {
      throw new NotFoundException('No active proctor found for this student.');
    }
    const proctor =
      mapping.proctor ??
      (await this.users.findOne({ where: { user_id: mapping.proctor_user_id } }));
    if (!proctor) {
      throw new NotFoundException('Assigned proctor user record not found.');
    }
    return {
      userId: proctor.user_id,
      email: proctor.email,
      name: proctor.name,
      routeReason: 'ACTIVE_MENTORSHIP_PROCTOR',
    };
  }

  /** Direct reporting officer (HOD) for faculty/staff. */
  async getReportingOfficer(staffUserId: string): Promise<RoutedApprover> {
    const staff = await this.users.findOne({ where: { user_id: staffUserId } });
    if (!staff?.reporting_officer_id) {
      throw new NotFoundException('No reporting officer assigned for this user.');
    }
    const officer = await this.users.findOne({
      where: { user_id: staff.reporting_officer_id },
    });
    if (!officer) {
      throw new NotFoundException('Reporting officer user record not found.');
    }
    return {
      userId: officer.user_id,
      email: officer.email,
      name: officer.name,
      routeReason: 'REPORTING_OFFICER',
    };
  }

  async getHrAdmin(tenantId: string): Promise<RoutedApprover> {
    return this.resolveUserByEmail(this.hrAdminEmail, tenantId, 'HR_ADMIN');
  }

  async getFinanceAdmin(tenantId: string): Promise<RoutedApprover> {
    return this.resolveUserByEmail(this.financeAdminEmail, tenantId, 'FINANCE_ADMIN');
  }

  async getItAdmin(tenantId: string): Promise<RoutedApprover> {
    try {
      return await this.resolveUserByEmail(this.itAdminEmail, tenantId, 'IT_ADMIN');
    } catch {
      const byRole = await this.resolveUserByRole('SuperAdmin', tenantId);
      if (byRole) return { ...byRole, routeReason: 'IT_ADMIN_ROLE_FALLBACK' };
      throw new NotFoundException('No IT admin user configured for helpdesk routing.');
    }
  }

  /**
   * Warden for the student's active hostel allocation (room block → warden_user_id).
   */
  async getWardenForStudent(studentUserId: string): Promise<RoutedApprover> {
    const allocation = await this.hostelAllocations.findOne({
      where: { student_user_id: studentUserId, status: 'ACTIVE' },
      order: { updated_at: 'DESC' },
    });
    if (!allocation) {
      throw new NotFoundException('Student has no active hostel allocation.');
    }

    const room = await this.hostelRooms.findOne({
      where: { room_id: allocation.room_id },
    });
    if (!room) {
      throw new NotFoundException('Hostel room not found for allocation.');
    }

    const wardenUserId = allocation.warden_user_id ?? room.warden_user_id;
    if (!wardenUserId) {
      throw new NotFoundException(
        `No warden assigned for block ${room.hostel_block} / room ${room.room_number}.`,
      );
    }

    const warden = await this.users.findOne({ where: { user_id: wardenUserId } });
    if (!warden) {
      throw new NotFoundException('Warden user record not found.');
    }

    return {
      userId: warden.user_id,
      email: warden.email,
      name: warden.name,
      routeReason: `HOSTEL_BLOCK_${room.hostel_block}`,
    };
  }

  /** Helpdesk dispatcher by category. */
  async getHelpdeskAssignee(
    studentUserId: string,
    tenantId: string,
    category: HelpdeskTicketCategory,
  ): Promise<RoutedApprover> {
    switch (category) {
      case 'FINANCE': {
        const admin = await this.resolveUserByRole('Accountant', tenantId) || await this.resolveUserByRole('FinanceManager', tenantId);
        if (admin) return admin;
        return this.getFinanceAdmin(tenantId);
      }
      case 'IT': {
        const admin = await this.resolveUserByRole('Admin', tenantId) || await this.resolveUserByRole('SuperAdmin', tenantId);
        if (admin) return admin;
        return this.getItAdmin(tenantId);
      }
      case 'HR': {
        const hrAdmin = await this.resolveUserByRole('HRAdmin', tenantId) || await this.resolveUserByRole('HR', tenantId);
        if (hrAdmin) return hrAdmin;
        return this.getHrAdmin(tenantId);
      }
      case 'FACILITIES': {
        const facAdmin = await this.resolveUserByRole('Warden', tenantId) || await this.resolveUserByRole('SuperAdmin', tenantId);
        if (facAdmin) return facAdmin;
        const superAdmin = await this.resolveUserByRole('SuperAdmin', tenantId);
        if (superAdmin) return superAdmin;
        throw new NotFoundException('No facilities admin found for helpdesk routing');
      }
      case 'HOSTEL': {
        try {
          return await this.getWardenForStudent(studentUserId);
        } catch {
          const warden = await this.resolveUserByRole('Warden', tenantId);
          if (warden) return warden;
          throw new NotFoundException('No warden found for helpdesk routing');
        }
      }
      case 'MENTORSHIP':
        return this.getStudentProctor(studentUserId);
      case 'ACADEMICS': {
        const hod = await this.resolveUserByRole('HOD', tenantId) || await this.resolveUserByRole('Dean', tenantId);
        if (hod) return hod;
        return this.resolveUserByEmail(
          this.fallbackHodEmail,
          tenantId,
          'ACADEMICS_HOD_FALLBACK',
        );
      }
      case 'STUDENT_PROFILE':
        try {
          const reg = await this.resolveUserByRole('Registrar', tenantId);
          if (reg) return reg;
          return await this.resolveUserByEmail(
            this.fallbackRegistrarEmail,
            tenantId,
            'STUDENT_PROFILE_REGISTRAR',
          );
        } catch {
          const hod = await this.resolveUserByRole('HOD', tenantId);
          if (hod) return hod;
          return this.resolveUserByEmail(
            this.fallbackHodEmail,
            tenantId,
            'STUDENT_PROFILE_HOD_FALLBACK',
          );
        }
      default:
        throw new BadRequestException(`Unsupported helpdesk category: ${category}`);
    }
  }

  async resolveUserByEmail(
    email: string,
    tenantId: string,
    routeReason: string,
  ): Promise<RoutedApprover> {
    const user = await this.users.findOne({
      where: { email: email.toLowerCase(), tenant_id: tenantId },
    });
    if (!user) {
      const byOfficial = await this.users
        .createQueryBuilder('u')
        .where('u.tenant_id = :tenantId', { tenantId })
        .andWhere('LOWER(u.official_email) = LOWER(:email)', { email })
        .getOne();
      if (!byOfficial) {
        throw new NotFoundException(`No user found for email ${email}.`);
      }
      return {
        userId: byOfficial.user_id,
        email: byOfficial.email,
        name: byOfficial.name,
        routeReason,
      };
    }
    return {
      userId: user.user_id,
      email: user.email,
      name: user.name,
      routeReason,
    };
  }

  private async resolveUserByRole(
    roleName: string,
    tenantId: string,
  ): Promise<RoutedApprover | null> {
    const user = await this.users
      .createQueryBuilder('u')
      .innerJoin('u.role', 'r')
      .where('u.tenant_id = :tenantId', { tenantId })
      .andWhere('r.role_name = :roleName', { roleName })
      .orderBy('u.created_at', 'ASC')
      .getOne();
    if (!user) return null;
    return {
      userId: user.user_id,
      email: user.email,
      name: user.name,
      routeReason: `ROLE_${roleName}`,
    };
  }
}
