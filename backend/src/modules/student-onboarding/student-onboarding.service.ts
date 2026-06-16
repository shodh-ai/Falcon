import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';

const REQUIRED_DOC_TYPES = ['AADHAAR', '10TH_MARKSHEET', '12TH_MARKSHEET', 'PHOTO'] as const;
type DocType = (typeof REQUIRED_DOC_TYPES)[number];

type OnboardingDocRow = {
  doc_id: string;
  doc_type: DocType;
  file_path: string;
  status: string;
  admin_remarks: string | null;
  uploaded_at: string;
};

@Injectable()
export class StudentOnboardingService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationEmitterService,
  ) {}

  async getStatus(tenantId: string, userId: string) {
    const [user] = await this.dataSource.query<
      Array<{ onboarding_status: string; name: string; official_email: string }>
    >(
      `SELECT onboarding_status, name, official_email
       FROM users
       WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId],
    );
    if (!user) throw new NotFoundException('User not found');

    const docs = await this.listDocs(tenantId, userId);
    return {
      onboarding_status: user.onboarding_status,
      name: user.name,
      email: user.official_email,
      documents: docs,
      required_doc_types: REQUIRED_DOC_TYPES,
    };
  }

  async resetPassword(
    tenantId: string,
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters');
    }
    if (newPassword === 'password123') {
      throw new BadRequestException('Please choose a password different from the default');
    }

    const [row] = await this.dataSource.query<
      Array<{ password_hash: string | null; onboarding_status: string }>
    >(
      `SELECT password_hash, onboarding_status
       FROM users
       WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId],
    );
    if (!row?.password_hash) throw new UnauthorizedException('Invalid current password');
    if (row.onboarding_status !== 'PENDING_PASSWORD_RESET') {
      throw new BadRequestException('Password reset is not required at this stage');
    }

    const valid = await bcrypt.compare(currentPassword, row.password_hash);
    if (!valid) throw new UnauthorizedException('Invalid current password');

    const hash = await bcrypt.hash(newPassword, 10);
    await this.dataSource.query(
      `UPDATE users
       SET password_hash = $1, onboarding_status = 'PENDING_DOCUMENTS', updated_at = NOW()
       WHERE user_id = $2 AND tenant_id = $3`,
      [hash, userId, tenantId],
    );

    return { onboarding_status: 'PENDING_DOCUMENTS' };
  }

  async getStep2Profile(tenantId: string, userId: string) {
    const [profile] = await this.dataSource.query<
      Array<{
        blood_group: string | null;
        abc_id: string | null;
        parent_info: Record<string, unknown> | null;
        profile_photo_url: string | null;
      }>
    >(
      `SELECT sp.blood_group, sp.abc_id, sp.parent_info, sp.profile_photo_url
       FROM student_profiles sp
       WHERE sp.user_id = $1 AND sp.tenant_id = $2`,
      [userId, tenantId],
    );

    const docs = await this.listDocs(tenantId, userId);
    const parentInfo = profile?.parent_info ?? {};
    return {
      blood_group: profile?.blood_group ?? '',
      abc_id: profile?.abc_id ?? '',
      parent_contact_phone:
        (parentInfo.emergency_contact_phone as string | undefined) ??
        (parentInfo.parent_contact_phone as string | undefined) ??
        '',
      documents: docs,
      admin_remarks: docs.find((d) => d.status === 'REJECTED')?.admin_remarks ?? null,
    };
  }

  async saveStep2Profile(
    tenantId: string,
    userId: string,
    body: { blood_group?: string; parent_contact_phone?: string; abc_id?: string },
  ) {
    const bloodGroup = body.blood_group?.trim();
    const parentPhone = body.parent_contact_phone?.trim();
    const abcId = body.abc_id?.trim();

    if (!bloodGroup) throw new BadRequestException('Blood group is required');
    if (!parentPhone) throw new BadRequestException('Parent contact number is required');
    if (!abcId) throw new BadRequestException('ABC ID is required');

    await this.dataSource.query(
      `INSERT INTO student_profiles (tenant_id, user_id, blood_group, abc_id, parent_info, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'ACTIVE')
       ON CONFLICT (user_id) DO UPDATE SET
         blood_group = EXCLUDED.blood_group,
         abc_id = EXCLUDED.abc_id,
         parent_info = COALESCE(student_profiles.parent_info, '{}'::jsonb) || EXCLUDED.parent_info,
         updated_at = NOW()`,
      [
        tenantId,
        userId,
        bloodGroup,
        abcId,
        JSON.stringify({
          emergency_contact_phone: parentPhone,
          parent_contact_phone: parentPhone,
        }),
      ],
    );

    return this.getStep2Profile(tenantId, userId);
  }

  async registerDocument(
    tenantId: string,
    userId: string,
    docType: DocType,
    filePath: string,
  ) {
    if (!REQUIRED_DOC_TYPES.includes(docType)) {
      throw new BadRequestException('Invalid document type');
    }

    await this.dataSource.query(
      `INSERT INTO student_onboarding_docs (tenant_id, student_user_id, doc_type, file_path, status)
       VALUES ($1, $2, $3, $4, 'PENDING')
       ON CONFLICT (student_user_id, doc_type) DO UPDATE SET
         file_path = EXCLUDED.file_path,
         status = 'PENDING',
         admin_remarks = NULL,
         uploaded_at = NOW()`,
      [tenantId, userId, docType, filePath],
    );

    if (docType === 'PHOTO') {
      await this.dataSource.query(
        `UPDATE student_profiles
         SET profile_photo_url = $1, updated_at = NOW()
         WHERE user_id = $2 AND tenant_id = $3`,
        [filePath, userId, tenantId],
      );
    }

    return this.listDocs(tenantId, userId);
  }

  async submitForVerification(tenantId: string, userId: string) {
    const [user] = await this.dataSource.query<Array<{ onboarding_status: string }>>(
      `SELECT onboarding_status FROM users WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId],
    );
    if (user?.onboarding_status !== 'PENDING_DOCUMENTS') {
      throw new BadRequestException('Profile submission is not available at this stage');
    }

    const profile = await this.getStep2Profile(tenantId, userId);
    if (!profile.blood_group || !profile.parent_contact_phone || !profile.abc_id) {
      throw new BadRequestException('Please complete all profile fields before submitting');
    }

    const docs = await this.listDocs(tenantId, userId);
    const missing = REQUIRED_DOC_TYPES.filter(
      (type) => !docs.some((d) => d.doc_type === type && d.file_path),
    );
    if (missing.length) {
      throw new BadRequestException(`Missing documents: ${missing.join(', ')}`);
    }

    await this.dataSource.query(
      `UPDATE users
       SET onboarding_status = 'PENDING_ADMIN_APPROVAL', updated_at = NOW()
       WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId],
    );

    return { onboarding_status: 'PENDING_ADMIN_APPROVAL' };
  }

  async getVerificationQueue(tenantId: string) {
    const rows = await this.dataSource.query<
      Array<{
        user_id: string;
        name: string;
        official_email: string;
        onboarding_status: string;
        submitted_at: string | null;
        doc_count: string;
      }>
    >(
      `SELECT u.user_id, u.name, u.official_email, u.onboarding_status,
              MAX(d.uploaded_at) AS submitted_at,
              COUNT(d.doc_id)::text AS doc_count
       FROM users u
       LEFT JOIN student_onboarding_docs d ON d.student_user_id = u.user_id
       WHERE u.tenant_id = $1
         AND u.onboarding_status = 'PENDING_ADMIN_APPROVAL'
       GROUP BY u.user_id, u.name, u.official_email, u.onboarding_status
       ORDER BY submitted_at DESC NULLS LAST, u.name ASC`,
      [tenantId],
    );
    return rows;
  }

  async getVerificationDetail(tenantId: string, studentUserId: string) {
    const [student] = await this.dataSource.query<
      Array<{
        user_id: string;
        name: string;
        official_email: string;
        onboarding_status: string;
        blood_group: string | null;
        abc_id: string | null;
        parent_info: Record<string, unknown> | null;
        profile_photo_url: string | null;
        enrollment_no: string | null;
        batch: string | null;
      }>
    >(
      `SELECT u.user_id, u.name, u.official_email, u.onboarding_status,
              sp.blood_group, sp.abc_id, sp.parent_info, sp.profile_photo_url,
              sp.enrollment_no, sp.batch
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE u.user_id = $1 AND u.tenant_id = $2`,
      [studentUserId, tenantId],
    );
    if (!student) throw new NotFoundException('Student not found');

    const docs = await this.listDocs(tenantId, studentUserId);
    const parentInfo = student.parent_info ?? {};

    return {
      student: {
        user_id: student.user_id,
        name: student.name,
        email: student.official_email,
        onboarding_status: student.onboarding_status,
        blood_group: student.blood_group,
        abc_id: student.abc_id,
        parent_contact_phone:
          (parentInfo.emergency_contact_phone as string | undefined) ??
          (parentInfo.parent_contact_phone as string | undefined) ??
          null,
        enrollment_no: student.enrollment_no,
        batch: student.batch,
      },
      documents: docs,
    };
  }

  async approve(tenantId: string, studentUserId: string) {
    const detail = await this.getVerificationDetail(tenantId, studentUserId);
    if (detail.student.onboarding_status !== 'PENDING_ADMIN_APPROVAL') {
      throw new BadRequestException('Student is not awaiting admin approval');
    }

    await this.dataSource.query(
      `UPDATE users
       SET onboarding_status = 'COMPLETED', updated_at = NOW()
       WHERE user_id = $1 AND tenant_id = $2`,
      [studentUserId, tenantId],
    );

    await this.dataSource.query(
      `UPDATE student_onboarding_docs
       SET status = 'APPROVED', admin_remarks = NULL
       WHERE student_user_id = $1 AND tenant_id = $2`,
      [studentUserId, tenantId],
    );

    this.notifications.studentOnboardingApproved({
      tenantId,
      userId: studentUserId,
      studentName: detail.student.name,
      officialEmail: detail.student.email,
    });

    return { onboarding_status: 'COMPLETED' };
  }

  async reject(
    tenantId: string,
    studentUserId: string,
    remarks: string,
  ) {
    const reason = remarks?.trim();
    if (!reason) throw new BadRequestException('Rejection reason is required');

    const detail = await this.getVerificationDetail(tenantId, studentUserId);
    if (detail.student.onboarding_status !== 'PENDING_ADMIN_APPROVAL') {
      throw new BadRequestException('Student is not awaiting admin approval');
    }

    await this.dataSource.query(
      `UPDATE users
       SET onboarding_status = 'PENDING_DOCUMENTS', updated_at = NOW()
       WHERE user_id = $1 AND tenant_id = $2`,
      [studentUserId, tenantId],
    );

    await this.dataSource.query(
      `UPDATE student_onboarding_docs
       SET status = 'REJECTED', admin_remarks = $3
       WHERE student_user_id = $1 AND tenant_id = $2`,
      [studentUserId, tenantId, reason],
    );

    return { onboarding_status: 'PENDING_DOCUMENTS', admin_remarks: reason };
  }

  async getDocumentPath(tenantId: string, studentUserId: string, docType: string) {
    const [row] = await this.dataSource.query<Array<{ file_path: string }>>(
      `SELECT file_path
       FROM student_onboarding_docs
       WHERE tenant_id = $1 AND student_user_id = $2 AND doc_type = $3
       LIMIT 1`,
      [tenantId, studentUserId, docType],
    );
    if (!row?.file_path) throw new NotFoundException('Document not found');
    return row.file_path;
  }

  private async listDocs(tenantId: string, userId: string): Promise<OnboardingDocRow[]> {
    return this.dataSource.query<OnboardingDocRow[]>(
      `SELECT doc_id, doc_type, file_path, status, admin_remarks, uploaded_at
       FROM student_onboarding_docs
       WHERE tenant_id = $1 AND student_user_id = $2
       ORDER BY doc_type ASC`,
      [tenantId, userId],
    );
  }
}
