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
import { EXAM_CELL_ACCESS_ROLES } from '../modules/exam-cell/exam-cell.constants';
import { normalizeExamCellRole } from '../modules/exam-cell/exam-cell-rbac.util';
import {
  isCurrentTranscript,
  type TranscriptRevisionMetadata,
} from '../modules/exam-cell/official-transcript-revisions';

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
    // Official transcripts have stricter, revision-aware access than ordinary
    // student uploads. Check everyone (including exam staff) before the
    // general staff exemption can apply.
    if (key.includes('/transcripts/')) {
      await this.assertTranscriptAccess(user, key);
      return;
    }
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
           AND t.tenant_id = $1 AND t.student_user_id = $2 AND t.status = 'SUCCESS'
         ${
           student
             ? `UNION ALL SELECT t.question_paper_url FROM weekly_tests t
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

      // Campus policies are optional in older tenant schemas. Their missing
      // table must not prevent a student from opening an authorized test paper
      // or another file returned by the query above.
      if (student) {
        const [policyTable] = await this.dataSource.query<
          Array<{ relation: string | null }>
        >("SELECT to_regclass('university_policies') AS relation");
        if (policyTable?.relation) {
          const policies = await this.dataSource.query<
            Array<{ file_reference: string | null }>
          >(
            `SELECT file_url AS file_reference FROM university_policies
             WHERE tenant_id = $1 AND status = 'ACTIVE'`,
            [tenantId],
          );
          if (
            policies.some(
              (policy) =>
                this.canonicalKey(policy.file_reference ?? '', tenantId) ===
                key,
            )
          )
            return;
        }
      }
    } catch {
      // A failed ownership lookup must never become unrestricted storage access.
      throw new NotFoundException('File not found');
    }
    throw new NotFoundException('File not found');
  }

  private async assertTranscriptAccess(user: UploadUser, key: string) {
    const match = key.match(
      /(?:^|\/)transcripts\/([0-9a-f-]{36})(?:-[0-9a-f]{32})?\.pdf$/i,
    );
    if (!match || !user.tenant_id || !user.user_id) {
      throw new NotFoundException('File not found');
    }
    const transcriptId = match[1];
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(transcriptId)) {
      throw new NotFoundException('File not found');
    }
    const rows = await this.dataSource.query<Array<{
      transcript_id: string;
      tenant_id: string;
      student_user_id: string;
      semester: number;
      status: string;
      metadata: TranscriptRevisionMetadata;
      pdf_url: string;
      verification_code: string;
    }>>(
      `SELECT transcript_id, tenant_id, student_user_id, semester, status, metadata, pdf_url, verification_code
       FROM official_transcripts
       WHERE tenant_id = $1 AND transcript_id = $2 AND pdf_url IS NOT NULL`,
      [user.tenant_id, transcriptId],
    );
    const record = rows[0];
    const examStaff = uploadRoles(user).some((role) =>
      EXAM_CELL_ACCESS_ROLES.some(
        (allowed) => normalizeExamCellRole(role) === normalizeExamCellRole(allowed),
      ),
    );
    if (!record || (record.student_user_id !== user.user_id && !examStaff)) {
      throw new NotFoundException('File not found');
    }
    const expectedKey = this.canonicalKey(record.pdf_url, user.tenant_id);
    if (expectedKey !== key || !(await isCurrentTranscript(this.dataSource, record))) {
      throw new NotFoundException('File not found');
    }
  }
}
