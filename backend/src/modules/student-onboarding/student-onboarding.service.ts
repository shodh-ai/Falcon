import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { HrFieldEncryptionService } from '../../common/crypto/hr-field-encryption.service';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { OnboardingVerificationNotifyService } from '../../core/notifications/onboarding-verification-notify.service';
import {
  getDashboardPathForRoleName,
  getRequiredDocTypes,
  resolveOnboardingPortalKind,
  type OnboardingPortalKind,
} from './onboarding-portal.util';

type OnboardingDocRow = {
  doc_id: string;
  doc_type: string;
  file_path: string;
  status: string;
  admin_remarks: string | null;
  uploaded_at: string;
};

function pgErrorCode(err: unknown): string | undefined {
  const pgErr = err as {
    code?: string;
    driverError?: { code?: string };
  };
  return pgErr.code ?? pgErr.driverError?.code;
}

function isPgUniqueViolation(err: unknown, columnHint?: string): boolean {
  if (pgErrorCode(err) !== '23505') return false;
  if (!columnHint) return true;
  const pgErr = err as { detail?: string; driverError?: { detail?: string } };
  const detail = pgErr.detail ?? pgErr.driverError?.detail ?? '';
  return detail.includes(columnHint);
}

function mapProfileSaveError(err: unknown): never {
  if (isPgUniqueViolation(err, 'abc_id')) {
    throw new BadRequestException(
      'This ABC ID is already registered to another student. Use your own 12-digit Academic Bank ID.',
    );
  }
  const code = pgErrorCode(err);
  if (code === '42703') {
    throw new BadRequestException(
      'Profile storage is not fully configured. Please contact support.',
    );
  }
  if (code === '22001') {
    throw new BadRequestException(
      'One or more fields exceed the allowed length. Please shorten your entries.',
    );
  }
  if (code === '22007' || code === '22008') {
    throw new BadRequestException(
      'Invalid date of birth. Use the date picker format.',
    );
  }
  throw err;
}

type ProfileBody = {
  blood_group?: string;
  parent_contact_phone?: string;
  abc_id?: string;
  pan_number?: string;
  aadhaar_number?: string;
  bank_account_no?: string;
  ifsc_code?: string;
  pf_uan?: string;
  student_mobile?: string;
  staff_mobile?: string;
  gender?: string;
  date_of_birth?: string;
  father_name?: string;
  mother_name?: string;
  parent_occupation?: string;
  annual_income?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  permanent_address?: string;
  current_address?: string;
  orcid_id?: string;
  scopus_id?: string;
  google_scholar_url?: string;
  total_experience_years?: number | string;
  industry_experience_years?: number | string;
  degree_level?: string;
  degree_name?: string;
  university?: string;
  passing_year?: number | string;
  specialization?: string;
};

const DEFAULT_TENANT_ID = 'a0000000-0000-4000-8000-000000000001';

@Injectable()
export class StudentOnboardingService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationEmitterService,
    private readonly onboardingVerificationNotify: OnboardingVerificationNotifyService,
    private readonly crypto: HrFieldEncryptionService,
  ) {}

  resolveTenantId(tenantId?: string | null) {
    const value = tenantId?.trim();
    return value || DEFAULT_TENANT_ID;
  }

  async getStatus(tenantId: string, userId: string) {
    const tenant = this.resolveTenantId(tenantId);
    const user = await this.getUserRow(tenant, userId);
    const kind = resolveOnboardingPortalKind(user.role_name);
    const docs = await this.listDocs(tenant, userId, kind);
    return {
      portal_kind: kind,
      onboarding_status: user.onboarding_status,
      name: user.name,
      email: user.official_email,
      documents: docs,
      required_doc_types: getRequiredDocTypes(kind),
    };
  }

  async resetPassword(
    tenantId: string,
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException(
        'New password must be at least 8 characters',
      );
    }
    if (newPassword === 'password123') {
      throw new BadRequestException(
        'Please choose a password different from the default',
      );
    }

    const tenant = this.resolveTenantId(tenantId);
    const [row] = await this.dataSource.query<
      Array<{ password_hash: string | null; onboarding_status: string }>
    >(
      `SELECT password_hash, onboarding_status
       FROM users
       WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenant],
    );
    if (!row?.password_hash)
      throw new UnauthorizedException('Invalid current password');
    if (row.onboarding_status !== 'PENDING_PASSWORD_RESET') {
      throw new BadRequestException(
        'Password reset is not required at this stage',
      );
    }

    const valid = await bcrypt.compare(currentPassword, row.password_hash);
    if (!valid) throw new UnauthorizedException('Invalid current password');

    const hash = await bcrypt.hash(newPassword, 10);
    await this.dataSource.query(
      `UPDATE users
       SET password_hash = $1, onboarding_status = 'PENDING_DOCUMENTS', updated_at = NOW()
       WHERE user_id = $2 AND tenant_id = $3`,
      [hash, userId, tenant],
    );

    return { onboarding_status: 'PENDING_DOCUMENTS' };
  }

  async getStep2Profile(tenantId: string, userId: string) {
    const tenant = this.resolveTenantId(tenantId);
    const user = await this.getUserRow(tenant, userId);
    const kind = resolveOnboardingPortalKind(user.role_name);
    const docs = await this.listDocs(tenant, userId, kind);

    if (kind === 'staff') {
      const profile = user.onboarding_profile ?? {};
      const qualification = (profile.qualification ?? {}) as Record<
        string,
        unknown
      >;
      return {
        portal_kind: kind,
        blood_group: (profile.blood_group as string | undefined) ?? '',
        pan_number: (profile.pan_number as string | undefined) ?? '',
        aadhaar_number: (profile.aadhaar_number as string | undefined) ?? '',
        bank_account_no: (profile.bank_account_no as string | undefined) ?? '',
        ifsc_code: (profile.ifsc_code as string | undefined) ?? '',
        pf_uan: (profile.pf_uan as string | undefined) ?? '',
        gender: (profile.gender as string | undefined) ?? '',
        date_of_birth: profile.date_of_birth
          ? String(profile.date_of_birth).slice(0, 10)
          : '',
        staff_mobile:
          user.phone ?? (profile.staff_mobile as string | undefined) ?? '',
        emergency_contact_name:
          (profile.emergency_contact_name as string | undefined) ?? '',
        emergency_contact_phone:
          (profile.emergency_contact_phone as string | undefined) ?? '',
        permanent_address:
          (profile.permanent_address as string | undefined) ?? '',
        current_address: (profile.current_address as string | undefined) ?? '',
        orcid_id: (profile.orcid_id as string | undefined) ?? '',
        scopus_id: (profile.scopus_id as string | undefined) ?? '',
        google_scholar_url:
          (profile.google_scholar_url as string | undefined) ?? '',
        total_experience_years:
          profile.total_experience_years != null
            ? String(profile.total_experience_years)
            : '',
        industry_experience_years:
          profile.industry_experience_years != null
            ? String(profile.industry_experience_years)
            : '0',
        degree_level: (qualification.degree_level as string | undefined) ?? '',
        degree_name: (qualification.degree_name as string | undefined) ?? '',
        university: (qualification.university as string | undefined) ?? '',
        passing_year:
          qualification.passing_year != null
            ? String(qualification.passing_year)
            : '',
        specialization:
          (qualification.specialization as string | undefined) ?? '',
        documents: docs,
        admin_remarks:
          docs.find((d) => d.status === 'REJECTED')?.admin_remarks ?? null,
      };
    }

    const [profile] = await this.dataSource.query<
      Array<{
        blood_group: string | null;
        abc_id: string | null;
        gender: string | null;
        date_of_birth: string | null;
        parent_info: Record<string, unknown> | null;
      }>
    >(
      `SELECT sp.blood_group, sp.abc_id, sp.gender, sp.date_of_birth, sp.parent_info
       FROM student_profiles sp
       WHERE sp.user_id = $1 AND sp.tenant_id = $2`,
      [userId, tenant],
    );

    const parentInfo = profile?.parent_info ?? {};
    return {
      portal_kind: kind,
      blood_group: profile?.blood_group ?? '',
      abc_id: profile?.abc_id ?? '',
      gender: profile?.gender ?? '',
      date_of_birth: profile?.date_of_birth
        ? String(profile.date_of_birth).slice(0, 10)
        : '',
      student_mobile: (parentInfo.student_mobile as string | undefined) ?? '',
      father_name: (parentInfo.father_name as string | undefined) ?? '',
      mother_name: (parentInfo.mother_name as string | undefined) ?? '',
      parent_occupation:
        (parentInfo.parent_occupation as string | undefined) ?? '',
      annual_income: (parentInfo.annual_income as string | undefined) ?? '',
      emergency_contact_name:
        (parentInfo.emergency_contact_name as string | undefined) ?? '',
      permanent_address:
        (parentInfo.permanent_address as string | undefined) ?? '',
      current_address: (parentInfo.current_address as string | undefined) ?? '',
      parent_contact_phone:
        (parentInfo.emergency_contact_phone as string | undefined) ??
        (parentInfo.parent_contact_phone as string | undefined) ??
        '',
      documents: docs,
      admin_remarks:
        docs.find((d) => d.status === 'REJECTED')?.admin_remarks ?? null,
    };
  }

  async saveStep2Profile(tenantId: string, userId: string, body: ProfileBody) {
    const tenant = this.resolveTenantId(tenantId);
    const user = await this.getUserRow(tenant, userId);
    const kind = resolveOnboardingPortalKind(user.role_name);

    if (kind === 'staff') {
      return this.saveStaffProfile(tenant, userId, body);
    }
    return this.saveStudentProfile(tenant, userId, body);
  }

  async registerDocument(
    tenantId: string,
    userId: string,
    docType: string,
    filePath: string,
  ) {
    const user = await this.getUserRow(tenantId, userId);
    const kind = resolveOnboardingPortalKind(user.role_name);
    const required = getRequiredDocTypes(kind);
    if (!required.includes(docType)) {
      throw new BadRequestException('Invalid document type');
    }

    if (kind === 'staff') {
      await this.dataSource.query(
        `INSERT INTO staff_onboarding_docs (tenant_id, staff_user_id, doc_type, file_path, status)
         VALUES ($1, $2, $3, $4, 'PENDING')
         ON CONFLICT (staff_user_id, doc_type) DO UPDATE SET
           file_path = EXCLUDED.file_path,
           status = 'PENDING',
           admin_remarks = NULL,
           uploaded_at = NOW()`,
        [tenantId, userId, docType, filePath],
      );
      if (docType === 'PHOTO') {
        await this.dataSource.query(
          `UPDATE users
           SET onboarding_profile = COALESCE(onboarding_profile, '{}'::jsonb) || $1::jsonb,
               updated_at = NOW()
           WHERE user_id = $2 AND tenant_id = $3`,
          [JSON.stringify({ profile_photo_url: filePath }), userId, tenantId],
        );
      }
    } else {
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
    }

    return this.listDocs(tenantId, userId, kind);
  }

  async submitForVerification(tenantId: string, userId: string) {
    const user = await this.getUserRow(tenantId, userId);
    if (user.onboarding_status !== 'PENDING_DOCUMENTS') {
      throw new BadRequestException(
        'Profile submission is not available at this stage',
      );
    }

    const kind = resolveOnboardingPortalKind(user.role_name);
    const profile = await this.getStep2Profile(tenantId, userId);
    this.validateProfileComplete(kind, profile);

    const docs = await this.listDocs(tenantId, userId, kind);
    const missing = getRequiredDocTypes(kind).filter(
      (type) => !docs.some((d) => d.doc_type === type && d.file_path),
    );
    if (missing.length) {
      throw new BadRequestException(`Missing documents: ${missing.join(', ')}`);
    }

    const submitted = await this.dataSource.query<Array<{ user_id: string }>>(
      `UPDATE users
       SET onboarding_status = 'PENDING_ADMIN_APPROVAL', updated_at = NOW()
       WHERE user_id = $1 AND tenant_id = $2 AND onboarding_status = 'PENDING_DOCUMENTS'
       RETURNING user_id`,
      [userId, tenantId],
    );
    if (!submitted.length) {
      throw new BadRequestException(
        'Could not submit profile for verification',
      );
    }

    this.notifications.onboardingVerificationRequested({
      tenantId,
      targetUserId: userId,
      submitterName: user.name,
      submitterEmail: user.official_email,
      roleName: user.role_name,
      portalKind: kind,
    });

    return { onboarding_status: 'PENDING_ADMIN_APPROVAL' };
  }

  async getVerificationQueue(
    tenantId: string,
    portalKind?: OnboardingPortalKind | 'all',
  ) {
    const tenant = this.resolveTenantId(tenantId);
    await this.onboardingVerificationNotify
      .syncPendingVerificationNotifications(tenant)
      .catch(() => undefined);

    const rows = await this.dataSource.query<
      Array<{
        user_id: string;
        name: string;
        official_email: string;
        onboarding_status: string;
        role_name: string;
        portal_kind: string;
        submitted_at: string | null;
        doc_count: string;
      }>
    >(
      `SELECT u.user_id, u.name, u.official_email, u.onboarding_status, r.role_name,
              CASE
                WHEN lower(r.role_name) IN ('faculty', 'hod', 'dean') THEN 'staff'
                ELSE 'student'
              END AS portal_kind,
              GREATEST(
                (SELECT MAX(d.uploaded_at) FROM student_onboarding_docs d WHERE d.student_user_id = u.user_id),
                (SELECT MAX(d.uploaded_at) FROM staff_onboarding_docs d WHERE d.staff_user_id = u.user_id)
              ) AS submitted_at,
              (
                COALESCE((SELECT COUNT(*) FROM student_onboarding_docs d WHERE d.student_user_id = u.user_id), 0)
                + COALESCE((SELECT COUNT(*) FROM staff_onboarding_docs d WHERE d.staff_user_id = u.user_id), 0)
              )::text AS doc_count
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1
         AND u.onboarding_status = 'PENDING_ADMIN_APPROVAL'
       ORDER BY submitted_at DESC NULLS LAST, u.name ASC`,
      [tenant],
    );

    if (!portalKind || portalKind === 'all') return rows;
    return rows.filter((row) => row.portal_kind === portalKind);
  }

  async getVerificationDetail(tenantId: string, targetUserId: string) {
    const tenant = this.resolveTenantId(tenantId);
    const user = await this.getUserRow(tenant, targetUserId);
    const kind = resolveOnboardingPortalKind(user.role_name);
    const profile = await this.getStep2Profile(tenant, targetUserId);
    const docs = await this.listDocs(tenant, targetUserId, kind);

    const [employee] = await this.dataSource.query<
      Array<{ employee_id: string | null; designation: string | null }>
    >(
      `SELECT employee_id, designation
       FROM hr_employee_profiles
       WHERE tenant_id = $1 AND user_id = $2`,
      [tenant, targetUserId],
    );

    return {
      portal_kind: kind,
      person: {
        user_id: user.user_id,
        name: user.name,
        email: user.official_email,
        role_name: user.role_name,
        employee_id: employee?.employee_id ?? null,
        designation: employee?.designation ?? null,
        ...profile,
        onboarding_status: user.onboarding_status,
      },
      documents: docs,
    };
  }

  async approve(tenantId: string, targetUserId: string) {
    const tenant = this.resolveTenantId(tenantId);
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const locked = (await qr.query(
        `SELECT u.user_id, u.name, u.official_email, u.onboarding_status, r.role_name
         FROM users u
         JOIN roles r ON r.role_id = u.role_id
         WHERE u.user_id = $1 AND u.tenant_id = $2
         FOR UPDATE`,
        [targetUserId, tenant],
      )) as Array<{
        user_id: string;
        name: string;
        official_email: string;
        onboarding_status: string;
        role_name: string;
      }>;

      const user = locked[0];
      if (!user) throw new NotFoundException('User not found');

      const status = (user.onboarding_status ?? '').trim();
      if (status === 'COMPLETED') {
        throw new BadRequestException('User has already been approved');
      }
      if (status !== 'PENDING_ADMIN_APPROVAL') {
        throw new BadRequestException(
          `User is not awaiting admin approval (current status: ${status || 'UNKNOWN'})`,
        );
      }

      const kind = resolveOnboardingPortalKind(user.role_name);
      const updated = (await qr.query(
        `UPDATE users
         SET onboarding_status = 'COMPLETED', updated_at = NOW()
         WHERE user_id = $1 AND tenant_id = $2 AND onboarding_status = 'PENDING_ADMIN_APPROVAL'
         RETURNING user_id`,
        [targetUserId, tenant],
      )) as Array<{ user_id: string }>;
      if (!updated.length) {
        throw new BadRequestException('User is not awaiting admin approval');
      }

      if (kind === 'staff') {
        await qr.query(
          `UPDATE staff_onboarding_docs
           SET status = 'APPROVED', admin_remarks = NULL
           WHERE staff_user_id = $1 AND tenant_id = $2`,
          [targetUserId, tenant],
        );
        await this.finalizeStaffOnboarding(tenant, targetUserId, qr);
      } else {
        await qr.query(
          `UPDATE student_onboarding_docs
           SET status = 'APPROVED', admin_remarks = NULL
           WHERE student_user_id = $1 AND tenant_id = $2`,
          [targetUserId, tenant],
        );
      }

      await qr.commitTransaction();

      this.notifications.studentOnboardingApproved({
        tenantId: tenant,
        userId: targetUserId,
        studentName: user.name,
        officialEmail: user.official_email,
        dashboardPath: getDashboardPathForRoleName(user.role_name),
      });

      return { onboarding_status: 'COMPLETED' };
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }

  async reject(tenantId: string, targetUserId: string, remarks: string) {
    const reason = remarks?.trim();
    if (!reason) throw new BadRequestException('Rejection reason is required');

    const tenant = this.resolveTenantId(tenantId);
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const locked = (await qr.query(
        `SELECT u.user_id, u.onboarding_status, r.role_name
         FROM users u
         JOIN roles r ON r.role_id = u.role_id
         WHERE u.user_id = $1 AND u.tenant_id = $2
         FOR UPDATE`,
        [targetUserId, tenant],
      )) as Array<{
        user_id: string;
        onboarding_status: string;
        role_name: string;
      }>;

      const user = locked[0];
      if (!user) throw new NotFoundException('User not found');

      const status = (user.onboarding_status ?? '').trim();
      if (status !== 'PENDING_ADMIN_APPROVAL') {
        throw new BadRequestException(
          status === 'COMPLETED'
            ? 'User has already been approved'
            : `User is not awaiting admin approval (current status: ${status || 'UNKNOWN'})`,
        );
      }

      const kind = resolveOnboardingPortalKind(user.role_name);
      const updated = (await qr.query(
        `UPDATE users
         SET onboarding_status = 'PENDING_DOCUMENTS', updated_at = NOW()
         WHERE user_id = $1 AND tenant_id = $2 AND onboarding_status = 'PENDING_ADMIN_APPROVAL'
         RETURNING user_id`,
        [targetUserId, tenant],
      )) as Array<{ user_id: string }>;
      if (!updated.length) {
        throw new BadRequestException('User is not awaiting admin approval');
      }

      if (kind === 'staff') {
        await qr.query(
          `UPDATE staff_onboarding_docs
           SET status = 'REJECTED', admin_remarks = $3
           WHERE staff_user_id = $1 AND tenant_id = $2`,
          [targetUserId, tenant, reason],
        );
      } else {
        await qr.query(
          `UPDATE student_onboarding_docs
           SET status = 'REJECTED', admin_remarks = $3
           WHERE student_user_id = $1 AND tenant_id = $2`,
          [targetUserId, tenant, reason],
        );
      }

      await qr.commitTransaction();
      return { onboarding_status: 'PENDING_DOCUMENTS', admin_remarks: reason };
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }

  async getDocumentPath(
    tenantId: string,
    targetUserId: string,
    docType: string,
  ) {
    const user = await this.getUserRow(tenantId, targetUserId);
    const kind = resolveOnboardingPortalKind(user.role_name);

    if (kind === 'staff') {
      const [row] = await this.dataSource.query<Array<{ file_path: string }>>(
        `SELECT file_path
         FROM staff_onboarding_docs
         WHERE tenant_id = $1 AND staff_user_id = $2 AND doc_type = $3
         LIMIT 1`,
        [tenantId, targetUserId, docType],
      );
      if (!row?.file_path) throw new NotFoundException('Document not found');
      return row.file_path;
    }

    const [row] = await this.dataSource.query<Array<{ file_path: string }>>(
      `SELECT file_path
       FROM student_onboarding_docs
       WHERE tenant_id = $1 AND student_user_id = $2 AND doc_type = $3
       LIMIT 1`,
      [tenantId, targetUserId, docType],
    );
    if (!row?.file_path) throw new NotFoundException('Document not found');
    return row.file_path;
  }

  private validateProfileComplete(
    kind: OnboardingPortalKind,
    profile: Record<string, unknown>,
  ) {
    if (kind === 'staff') {
      const required = [
        'blood_group',
        'staff_mobile',
        'pan_number',
        'aadhaar_number',
        'bank_account_no',
        'ifsc_code',
        'gender',
        'date_of_birth',
        'emergency_contact_name',
        'emergency_contact_phone',
        'permanent_address',
        'current_address',
        'orcid_id',
        'total_experience_years',
        'degree_level',
        'university',
        'passing_year',
      ];
      const missing = required.filter(
        (field) => !String(profile[field] ?? '').trim(),
      );
      if (missing.length) {
        throw new BadRequestException(
          `Please complete all profile fields before submitting`,
        );
      }
      return;
    }

    const required = [
      'blood_group',
      'parent_contact_phone',
      'abc_id',
      'student_mobile',
      'gender',
      'date_of_birth',
      'father_name',
      'mother_name',
      'emergency_contact_name',
      'permanent_address',
      'current_address',
    ];
    const missing = required.filter(
      (field) => !String(profile[field] ?? '').trim(),
    );
    if (missing.length) {
      throw new BadRequestException(
        `Please complete all profile fields before submitting`,
      );
    }
  }

  private async saveStudentProfile(
    tenantId: string,
    userId: string,
    body: ProfileBody,
  ) {
    const bloodGroup = body.blood_group?.trim();
    const parentPhone = body.parent_contact_phone?.trim();
    const abcId = body.abc_id?.trim();
    const studentMobile = body.student_mobile?.trim();
    const gender = body.gender?.trim();
    const dateOfBirth = body.date_of_birth?.trim();
    const fatherName = body.father_name?.trim();
    const motherName = body.mother_name?.trim();
    const emergencyContactName = body.emergency_contact_name?.trim();
    const permanentAddress = body.permanent_address?.trim();
    const currentAddress = body.current_address?.trim();

    if (!bloodGroup) throw new BadRequestException('Blood group is required');
    if (!parentPhone)
      throw new BadRequestException('Parent contact number is required');
    if (!abcId) throw new BadRequestException('ABC ID is required');
    if (!studentMobile)
      throw new BadRequestException('Student mobile number is required');
    if (!gender) throw new BadRequestException('Gender is required');
    if (!dateOfBirth)
      throw new BadRequestException('Date of birth is required');
    if (!fatherName) throw new BadRequestException("Father's name is required");
    if (!motherName) throw new BadRequestException("Mother's name is required");
    if (!emergencyContactName)
      throw new BadRequestException('Emergency contact name is required');
    if (!permanentAddress)
      throw new BadRequestException('Permanent address is required');
    if (!currentAddress)
      throw new BadRequestException('Current address is required');

    try {
      await this.dataSource.query(
        `INSERT INTO student_profiles (tenant_id, user_id, blood_group, abc_id, gender, date_of_birth, parent_info, status)
         VALUES ($1, $2, $3, $4, $5, $6::date, $7::jsonb, 'ACTIVE')
         ON CONFLICT (user_id) DO UPDATE SET
           tenant_id = COALESCE(student_profiles.tenant_id, EXCLUDED.tenant_id),
           blood_group = EXCLUDED.blood_group,
           abc_id = EXCLUDED.abc_id,
           gender = EXCLUDED.gender,
           date_of_birth = EXCLUDED.date_of_birth,
           parent_info = COALESCE(student_profiles.parent_info, '{}'::jsonb) || EXCLUDED.parent_info,
           status = COALESCE(student_profiles.status, 'ACTIVE'),
           updated_at = NOW()`,
        [
          tenantId,
          userId,
          bloodGroup,
          abcId,
          gender,
          dateOfBirth,
          JSON.stringify({
            student_mobile: studentMobile,
            father_name: fatherName,
            mother_name: motherName,
            parent_occupation: body.parent_occupation?.trim() ?? '',
            annual_income: body.annual_income?.trim() ?? '',
            emergency_contact_name: emergencyContactName,
            emergency_contact_phone: parentPhone,
            parent_contact_phone: parentPhone,
            permanent_address: permanentAddress,
            current_address: currentAddress,
          }),
        ],
      );
    } catch (err) {
      mapProfileSaveError(err);
    }

    return this.getStep2Profile(tenantId, userId);
  }

  private async saveStaffProfile(
    tenantId: string,
    userId: string,
    body: ProfileBody,
  ) {
    const bloodGroup = body.blood_group?.trim();
    const staffMobile = (body.staff_mobile ?? body.student_mobile)?.trim();
    const panNumber = body.pan_number?.trim().toUpperCase();
    const aadhaarNumber = body.aadhaar_number?.trim().replace(/\s/g, '');
    const bankAccountNo = body.bank_account_no?.trim();
    const ifscCode = body.ifsc_code?.trim().toUpperCase();
    const pfUan = body.pf_uan?.trim();
    const gender = body.gender?.trim();
    const dateOfBirth = body.date_of_birth?.trim();
    const emergencyContactName = body.emergency_contact_name?.trim();
    const emergencyContactPhone = (
      body.emergency_contact_phone ?? body.parent_contact_phone
    )?.trim();
    const permanentAddress = body.permanent_address?.trim();
    const currentAddress = body.current_address?.trim();
    const orcidId = body.orcid_id?.trim();
    const scopusId = body.scopus_id?.trim();
    const googleScholarUrl = body.google_scholar_url?.trim();
    const totalExperienceYears =
      body.total_experience_years != null && body.total_experience_years !== ''
        ? Number(body.total_experience_years)
        : null;
    const industryExperienceYears =
      body.industry_experience_years != null &&
      body.industry_experience_years !== ''
        ? Number(body.industry_experience_years)
        : 0;
    const degreeLevel = body.degree_level?.trim();
    const degreeName = body.degree_name?.trim();
    const university = body.university?.trim();
    const passingYear =
      body.passing_year != null && body.passing_year !== ''
        ? Number(body.passing_year)
        : null;
    const specialization = body.specialization?.trim();

    if (!bloodGroup) throw new BadRequestException('Blood group is required');
    if (!staffMobile)
      throw new BadRequestException('Mobile number is required');
    if (!panNumber) throw new BadRequestException('PAN number is required');
    if (!aadhaarNumber)
      throw new BadRequestException('Aadhaar number is required');
    if (!bankAccountNo)
      throw new BadRequestException('Bank account number is required');
    if (!ifscCode) throw new BadRequestException('IFSC code is required');
    if (!gender) throw new BadRequestException('Gender is required');
    if (!dateOfBirth)
      throw new BadRequestException('Date of birth is required');
    if (!emergencyContactName)
      throw new BadRequestException('Emergency contact name is required');
    if (!emergencyContactPhone)
      throw new BadRequestException('Emergency contact phone is required');
    if (!permanentAddress)
      throw new BadRequestException('Permanent address is required');
    if (!currentAddress)
      throw new BadRequestException('Current address is required');
    if (!orcidId)
      throw new BadRequestException('ORCID ID is required for IQAC compliance');
    if (
      totalExperienceYears == null ||
      Number.isNaN(totalExperienceYears) ||
      totalExperienceYears < 0
    ) {
      throw new BadRequestException('Teaching experience (years) is required');
    }
    if (!degreeLevel)
      throw new BadRequestException('Highest degree level is required');
    if (!university) throw new BadRequestException('University is required');
    if (
      !passingYear ||
      Number.isNaN(passingYear) ||
      passingYear < 1950 ||
      passingYear > new Date().getFullYear() + 1
    ) {
      throw new BadRequestException('Valid passing year is required');
    }

    const profile = {
      blood_group: bloodGroup,
      staff_mobile: staffMobile,
      pan_number: panNumber,
      aadhaar_number: aadhaarNumber,
      bank_account_no: bankAccountNo,
      ifsc_code: ifscCode,
      pf_uan: pfUan ?? '',
      gender,
      date_of_birth: dateOfBirth,
      emergency_contact_name: emergencyContactName,
      emergency_contact_phone: emergencyContactPhone,
      permanent_address: permanentAddress,
      current_address: currentAddress,
      orcid_id: orcidId,
      scopus_id: scopusId ?? '',
      google_scholar_url: googleScholarUrl ?? '',
      total_experience_years: totalExperienceYears,
      industry_experience_years: industryExperienceYears,
      qualification: {
        degree_level: degreeLevel,
        degree_name: degreeName ?? '',
        university,
        passing_year: passingYear,
        specialization: specialization ?? '',
      },
    };

    await this.dataSource.query(
      `UPDATE users
       SET phone = $1,
           onboarding_profile = COALESCE(onboarding_profile, '{}'::jsonb) || $2::jsonb,
           updated_at = NOW()
       WHERE user_id = $3 AND tenant_id = $4`,
      [staffMobile, JSON.stringify(profile), userId, tenantId],
    );

    return this.getStep2Profile(tenantId, userId);
  }

  private async finalizeStaffOnboarding(
    tenantId: string,
    userId: string,
    runner?: QueryRunner,
  ) {
    const db = runner ?? this.dataSource;
    const [user] = await db.query<
      Array<{
        onboarding_profile: Record<string, unknown> | null;
        role_name: string;
        employee_id: string | null;
        designation: string | null;
        joining_date: string | null;
        entity_id: number | null;
      }>
    >(
      `SELECT u.onboarding_profile, r.role_name,
              p.employee_id, p.designation, p.joining_date, p.entity_id
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = u.tenant_id
       WHERE u.user_id = $1 AND u.tenant_id = $2`,
      [userId, tenantId],
    );
    if (!user) return;

    const profile = (user.onboarding_profile ?? {}) as Record<string, unknown>;
    const qualification = (profile.qualification ?? {}) as Record<
      string,
      unknown
    >;
    const employeeId =
      user.employee_id ??
      `SGVU-${userId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
    const designation = user.designation ?? user.role_name;
    const [entityRow] = await db.query<Array<{ entity_id: number }>>(
      `SELECT COALESCE(
         $2::int,
         (SELECT entity_id FROM org_entities WHERE tenant_id = $1 AND is_active = true ORDER BY entity_id LIMIT 1)
       ) AS entity_id`,
      [tenantId, user.entity_id],
    );
    const resolvedEntityId = entityRow?.entity_id ?? null;

    await db.query(
      `INSERT INTO hr_employee_profiles (
         tenant_id, user_id, employee_id, designation, joining_date, entity_id,
         pan_encrypted, aadhaar_encrypted, bank_account_encrypted, ifsc_code, pf_uan,
         orcid_id, scopus_id, google_scholar_url, total_experience_years, industry_experience_years,
         updated_at
       ) VALUES (
         $1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE), $6,
         $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW()
       )
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET
         pan_encrypted = COALESCE(EXCLUDED.pan_encrypted, hr_employee_profiles.pan_encrypted),
         aadhaar_encrypted = COALESCE(EXCLUDED.aadhaar_encrypted, hr_employee_profiles.aadhaar_encrypted),
         bank_account_encrypted = COALESCE(EXCLUDED.bank_account_encrypted, hr_employee_profiles.bank_account_encrypted),
         ifsc_code = COALESCE(EXCLUDED.ifsc_code, hr_employee_profiles.ifsc_code),
         pf_uan = COALESCE(NULLIF(EXCLUDED.pf_uan, ''), hr_employee_profiles.pf_uan),
         orcid_id = COALESCE(NULLIF(EXCLUDED.orcid_id, ''), hr_employee_profiles.orcid_id),
         scopus_id = COALESCE(NULLIF(EXCLUDED.scopus_id, ''), hr_employee_profiles.scopus_id),
         google_scholar_url = COALESCE(NULLIF(EXCLUDED.google_scholar_url, ''), hr_employee_profiles.google_scholar_url),
         total_experience_years = COALESCE(EXCLUDED.total_experience_years, hr_employee_profiles.total_experience_years),
         industry_experience_years = COALESCE(EXCLUDED.industry_experience_years, hr_employee_profiles.industry_experience_years),
         updated_at = NOW()`,
      [
        tenantId,
        userId,
        employeeId,
        designation,
        user.joining_date,
        resolvedEntityId,
        this.crypto.encrypt(String(profile.pan_number ?? '')),
        this.crypto.encrypt(String(profile.aadhaar_number ?? '')),
        this.crypto.encrypt(String(profile.bank_account_no ?? '')),
        profile.ifsc_code ?? null,
        profile.pf_uan || null,
        profile.orcid_id ?? null,
        profile.scopus_id || null,
        profile.google_scholar_url || null,
        profile.total_experience_years ?? null,
        profile.industry_experience_years ?? 0,
      ],
    );

    const [degreeDoc] = await db.query<Array<{ file_path: string }>>(
      `SELECT file_path FROM staff_onboarding_docs
       WHERE tenant_id = $1 AND staff_user_id = $2 AND doc_type = 'HIGHEST_DEGREE'
       ORDER BY uploaded_at DESC LIMIT 1`,
      [tenantId, userId],
    );

    const university = String(qualification.university ?? '').trim();
    const passingYear = Number(qualification.passing_year);
    if (university && passingYear) {
      const existing = await db.query(
        `SELECT qual_id FROM hr_academic_qualifications
         WHERE tenant_id = $1 AND user_id = $2 AND university = $3 AND passing_year = $4
         LIMIT 1`,
        [tenantId, userId, university, passingYear],
      );
      if (!existing.length) {
        await db.query(
          `INSERT INTO hr_academic_qualifications (
             tenant_id, user_id, degree_level, degree_name, university, passing_year,
             specialization, document_proof_url, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
          [
            tenantId,
            userId,
            qualification.degree_level ?? null,
            qualification.degree_name || null,
            university,
            passingYear,
            qualification.specialization || null,
            degreeDoc?.file_path ?? null,
          ],
        );
      }
    }

    if (resolvedEntityId) {
      await db.query(
        `UPDATE users
         SET entity_id = $3, updated_at = NOW()
         WHERE user_id = $2 AND tenant_id = $1
           AND (entity_id IS NULL OR entity_id IS DISTINCT FROM $3)`,
        [tenantId, userId, resolvedEntityId],
      );
      await db.query(
        `INSERT INTO user_entity_access (user_id, entity_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, entity_id) DO NOTHING`,
        [userId, resolvedEntityId],
      );
    }
  }

  private async getUserRow(tenantId: string, userId: string) {
    const [user] = await this.dataSource.query<
      Array<{
        user_id: string;
        name: string;
        official_email: string;
        onboarding_status: string;
        role_name: string;
        phone: string | null;
        onboarding_profile: Record<string, unknown> | null;
      }>
    >(
      `SELECT u.user_id, u.name, u.official_email, u.onboarding_status, u.phone, u.onboarding_profile,
              r.role_name
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.user_id = $1 AND u.tenant_id = $2`,
      [userId, tenantId],
    );
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async listDocs(
    tenantId: string,
    userId: string,
    kind: OnboardingPortalKind,
  ): Promise<OnboardingDocRow[]> {
    if (kind === 'staff') {
      return this.dataSource.query<OnboardingDocRow[]>(
        `SELECT doc_id, doc_type, file_path, status, admin_remarks, uploaded_at
         FROM staff_onboarding_docs
         WHERE tenant_id = $1 AND staff_user_id = $2
         ORDER BY doc_type ASC`,
        [tenantId, userId],
      );
    }

    return this.dataSource.query<OnboardingDocRow[]>(
      `SELECT doc_id, doc_type, file_path, status, admin_remarks, uploaded_at
       FROM student_onboarding_docs
       WHERE tenant_id = $1 AND student_user_id = $2
       ORDER BY doc_type ASC`,
      [tenantId, userId],
    );
  }
}
