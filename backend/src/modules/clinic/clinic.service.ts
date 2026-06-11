import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FalconNotification } from '../../entities/falcon-notification.entity';
import { User } from '../../entities/user.entity';

@Injectable()
export class ClinicService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectRepository(FalconNotification) private notifications: Repository<FalconNotification>,
    @InjectRepository(User) private users: Repository<User>,
    private events: EventEmitter2,
  ) {}

  private tenant(tenantId?: string) {
    return tenantId ?? 'a0000000-0000-4000-8000-000000000001';
  }

  listRecords(tenantId?: string) {
    return this.db.query(
      `SELECT cr.*, u.name AS patient_name
       FROM clinic_records cr
       LEFT JOIN users u ON u.user_id = cr.patient_user_id
       WHERE cr.tenant_id = $1
       ORDER BY cr.visit_date DESC LIMIT 100`,
      [this.tenant(tenantId)],
    );
  }

  async logVisit(
    tenantId: string,
    dto: {
      patient_user_id: string;
      doctor_name: string;
      diagnosis: string;
      rest_advised_days?: number;
    },
  ) {
    const tid = this.tenant(tenantId);
    const restDays = dto.rest_advised_days ?? 0;
    const rows = await this.db.query(
      `INSERT INTO clinic_records (tenant_id, patient_user_id, doctor_name, diagnosis, rest_advised_days)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tid, dto.patient_user_id, dto.doctor_name, dto.diagnosis, restDays],
    );
    const visit = rows[0];

    if (restDays > 0) {
      await this.triggerMedicalLeaveLoop(tid, dto.patient_user_id, restDays, dto.diagnosis);
    }

    return visit;
  }

  private async triggerMedicalLeaveLoop(
    tenantId: string,
    patientUserId: string,
    restDays: number,
    diagnosis: string,
  ) {
    const patient = await this.users.findOne({ where: { user_id: patientUserId } });
    if (!patient) return;

    const wardenRows = await this.db.query(
      `SELECT u.user_id FROM users u JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND r.role_name = 'Warden' AND u.is_active = true LIMIT 1`,
      [tenantId],
    );
    const proctorRows = await this.db.query(
      `SELECT proctor_user_id FROM academic_mentorships
       WHERE student_user_id = $1 AND is_active = true LIMIT 1`,
      [patientUserId],
    );

    const message = `${patient.name} advised ${restDays} day(s) rest: ${diagnosis}. Attendance marked Medical Leave.`;

    for (const target of [wardenRows[0], proctorRows[0]].filter(Boolean)) {
      const userId = (target as { user_id?: string; proctor_user_id?: string }).user_id
        ?? (target as { proctor_user_id?: string }).proctor_user_id;
      if (!userId) continue;
      await this.notifications.save(
        this.notifications.create({
          tenant_id: tenantId,
          user_id: userId,
          category: 'HOSTEL',
          title: 'Medical Leave Alert',
          message,
          action_link: '/hostel-admin/students',
          is_read: false,
        }),
      );
    }

    this.events.emit('clinic.medical_leave', {
      tenantId,
      patientUserId,
      restDays,
      diagnosis,
    });
  }

  lookupPatient(tenantId: string, emailOrId: string) {
    return this.db.query(
      `SELECT u.user_id, u.name, u.official_email, d.dept_name
       FROM users u
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE u.tenant_id = $1 AND (u.user_id::text = $2 OR u.official_email ILIKE $2)
       LIMIT 1`,
      [this.tenant(tenantId), emailOrId],
    );
  }
}
