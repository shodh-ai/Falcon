import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { resolve } from 'path';
import {
  canonicalUploadKey,
  needsStudentFileOwnership,
  uploadRoles,
  type UploadUser,
} from './upload-file-access';

@Injectable()
export class UploadsService {
  constructor(
    private configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  getUploadPath(): string {
    return this.configService.get<string>('UPLOAD_PATH') || './uploads';
  }

  getMaxFileSize(): number {
    return parseInt(
      this.configService.get<string>('MAX_FILE_SIZE') || '104857600',
    );
  }

  canonicalKey(reference: string, tenantId: string): string | null {
    return canonicalUploadKey(
      reference,
      tenantId,
      resolve(this.getUploadPath()),
    );
  }

  async assertStudentDownloadAccess(
    user: UploadUser,
    key: string,
  ): Promise<void> {
    if (!needsStudentFileOwnership(user)) return;
    if (!user.tenant_id || !user.user_id)
      throw new UnauthorizedException('Student identity required');
    const { tenant_id: tenantId, user_id: userId } = user;
    if (this.canonicalKey(key, tenantId) !== key)
      throw new NotFoundException('File not found');

    // New shared Student uploads are stored in a server-selected owner folder.
    // Legacy files are authorized from the existing document records below.
    const ownUploadPrefix = `${tenantId}/students/${userId}/`;
    if (
      key.startsWith(ownUploadPrefix) &&
      uploadRoles(user).includes('student')
    )
      return;

    const student = uploadRoles(user).includes('student');
    try {
      const files = await this.dataSource.query<
        Array<{ file_reference: string | null }>
      >(
        `SELECT file_path AS file_reference FROM student_onboarding_docs
         WHERE tenant_id = $1 AND student_user_id = $2
         UNION ALL SELECT file_path FROM student_certificates
         WHERE tenant_id = $1 AND student_user_id = $2 AND deleted_at IS NULL
         UNION ALL SELECT file_key FROM student_certificates
         WHERE tenant_id = $1 AND student_user_id = $2 AND deleted_at IS NULL
         UNION ALL SELECT file_url FROM student_documents
         WHERE tenant_id = $1 AND student_user_id = $2
         UNION ALL SELECT t.receipt_url FROM finance_transactions t
         JOIN finance_fee_demands d ON d.demand_id = t.demand_id
         WHERE d.tenant_id = $1 AND d.student_user_id = $2
           AND (t.tenant_id = $1 OR t.tenant_id IS NULL) AND t.student_user_id = $2 AND t.status = 'SUCCESS'
         UNION ALL SELECT v.receipt_url FROM finance_receipt_versions v
         JOIN finance_transactions t ON t.transaction_id = v.transaction_id AND (t.tenant_id = v.tenant_id OR t.tenant_id IS NULL)
         JOIN finance_fee_demands d ON d.demand_id = t.demand_id AND d.tenant_id = v.tenant_id
         WHERE v.tenant_id = $1 AND t.student_user_id = $2 AND d.student_user_id = $2
           AND t.status = 'SUCCESS' AND t.deleted_at IS NULL AND d.deleted_at IS NULL
         ${
           student
             ? `UNION ALL SELECT file_url FROM university_policies
         WHERE tenant_id = $1 AND status = 'ACTIVE'
         UNION ALL SELECT t.question_paper_url FROM weekly_tests t
         JOIN student_course_enrollments e ON e.course_id = t.course_id
           AND e.tenant_id = t.tenant_id AND e.student_user_id = $2
           AND e.status = 'ENROLLED' AND e.deleted_at IS NULL
         WHERE t.tenant_id = $1 AND t.is_active = true
           AND t.status IN ('SCHEDULED', 'ACTIVE')
           AND t.start_time <= NOW() AND t.end_time > NOW()
           AND NOT EXISTS (SELECT 1 FROM weekly_test_responses r
             WHERE r.test_id = t.test_id AND r.student_user_id = $2 AND r.submitted_at IS NOT NULL)`
             : ''
         }`,
        [tenantId, userId],
      );
      if (
        files.some(
          (file) =>
            this.canonicalKey(file.file_reference ?? '', tenantId) === key,
        )
      )
        return;
    } catch {
      // A failed ownership lookup must never become unrestricted storage access.
      throw new NotFoundException('File not found');
    }
    throw new NotFoundException('File not found');
  }
}
