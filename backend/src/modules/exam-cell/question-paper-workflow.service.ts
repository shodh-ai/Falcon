import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { isUUID, validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { createHash, randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { DataSource, EntityManager } from 'typeorm';
import { ObjectStorageService } from '../../storage/object-storage.service';
import { ExamCellAuditService } from './exam-cell-audit.service';
import { assertExamCellAction } from './exam-cell-rbac.util';
import {
  CreateQuestionPaperDto,
  QUESTION_PAPER_STATUSES,
  UpdateQuestionPaperStatusDto,
  UploadQuestionPaperDto,
} from './dto/question-paper.dto';

type Paper = {
  qp_id: string;
  tenant_id: string;
  status: string;
  exam_schedule_id: string | null;
  subject_id: number | null;
  storage_path: string | null;
  approved_by: string | null;
  approved_at: Date | null;
};
type Version = {
  version_id: string;
  qp_id: string;
  tenant_id: string;
  version_number: number;
  storage_key: string;
  document_sha256: string;
  document_bytes: number;
  uploaded_by: string;
  uploaded_at: Date;
  reason: string | null;
};
const NEXT: Record<string, string[]> = {
  UPLOADED: ['UNDER_MODERATION', 'REJECTED'],
  UNDER_MODERATION: ['COE_APPROVED', 'REJECTED'],
  COE_APPROVED: ['PRINT_AUTHORIZED', 'REJECTED'],
  PRINT_AUTHORIZED: [],
  REJECTED: [],
};
const MAX_BYTES = 25 * 1024 * 1024;

export function questionPaperKey(
  tenant: string,
  paper: string,
  version: string,
) {
  if (![tenant, paper, version].every((value) => isUUID(value)))
    throw new BadRequestException('Invalid question-paper identity');
  return `${tenant}/exam-cell/question-papers/${paper}/${version}.pdf`;
}

/** One workflow over the existing paper records, private storage and audit log. */
@Injectable()
export class QuestionPaperWorkflowService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly storage: ObjectStorageService,
    private readonly audit: ExamCellAuditService,
  ) {}

  private scope(
    tenant: string,
    actor?: string,
    role?: string,
    paperId?: string,
  ) {
    if (!isUUID(tenant))
      throw new ForbiddenException('Valid tenant context required');
    if (actor !== undefined) {
      if (!isUUID(actor))
        throw new ForbiddenException('Authenticated actor required');
      assertExamCellAction(role, 'manage_qp');
    }
    if (paperId !== undefined && !isUUID(paperId))
      throw new BadRequestException('Valid question-paper ID required');
  }

  private async paper(m: EntityManager, tenant: string, id: string) {
    const [row] = await m.query<Paper[]>(
      'SELECT * FROM exam_question_papers WHERE tenant_id=$1 AND qp_id=$2 FOR UPDATE',
      [tenant, id],
    );
    if (!row) throw new NotFoundException('Question paper not found');
    return row;
  }

  private async actor(m: EntityManager, tenant: string, actor: string) {
    const [user] = await m.query<Array<{ user_id: string }>>(
      'SELECT user_id FROM users WHERE tenant_id=$1 AND user_id=$2 AND is_active=true AND deleted_at IS NULL FOR SHARE',
      [tenant, actor],
    );
    if (!user)
      throw new ForbiddenException(
        'Active authenticated actor required in this tenant',
      );
  }

  private async current(m: EntityManager, tenant: string, id: string) {
    const [row] = await m.query<Version[]>(
      'SELECT * FROM exam_question_paper_versions WHERE tenant_id=$1 AND qp_id=$2 ORDER BY version_number DESC LIMIT 1',
      [tenant, id],
    );
    return row;
  }

  private validateVersion(paper: Paper, version: Version | undefined) {
    if (
      !version ||
      version.tenant_id !== paper.tenant_id ||
      version.qp_id !== paper.qp_id ||
      !Number.isSafeInteger(version.version_number) ||
      version.version_number < 1 ||
      paper.storage_path !== version.storage_key ||
      version.storage_key !==
        questionPaperKey(paper.tenant_id, paper.qp_id, version.version_id) ||
      !/^[0-9a-f]{64}$/.test(version.document_sha256) ||
      !Number.isSafeInteger(version.document_bytes) ||
      version.document_bytes < 1 ||
      version.document_bytes > MAX_BYTES
    )
      throw new ConflictException(
        'A verified current PDF version is required; legacy or unlinked files cannot authorize this action',
      );
    return version;
  }

  private async schedule(
    m: EntityManager,
    tenant: string,
    id: string | null,
    subject: number | null,
  ) {
    if (!id || !isUUID(id))
      throw new BadRequestException(
        'An explicit examination schedule is required',
      );
    const [schedule] = await m.query<Array<{ subject_id: number }>>(
      `SELECT s.subject_id FROM exam_schedules s JOIN academic_subjects a ON a.subject_id=s.subject_id
       WHERE s.tenant_id=$1 AND s.exam_schedule_id=$2 AND s.deleted_at IS NULL
         AND s.status <> 'CANCELLED' AND a.deleted_at IS NULL AND a.is_active=true FOR SHARE OF s,a`,
      [tenant, id],
    );
    if (!schedule)
      throw new NotFoundException(
        'Active examination schedule not found in this tenant',
      );
    if (
      subject !== null &&
      subject !== undefined &&
      subject !== schedule.subject_id
    )
      throw new BadRequestException(
        'Subject must match the examination schedule',
      );
    return schedule;
  }

  private validate<T extends object>(type: new () => T, dto: T) {
    if (
      validateSync(plainToInstance(type, dto), {
        whitelist: true,
        forbidNonWhitelisted: true,
      }).length
    )
      throw new BadRequestException('Invalid question-paper input');
  }

  async list(tenant: string, status?: string) {
    this.scope(tenant);
    if (
      status &&
      !(QUESTION_PAPER_STATUSES as readonly string[]).includes(status)
    )
      throw new BadRequestException('Invalid question-paper status');
    return this.db.query<Array<Record<string, unknown>>>(
      `SELECT p.qp_id,p.exam_schedule_id,p.subject_id,p.status,p.notes,p.created_at,p.updated_at,
              p.approved_by,p.approved_at,s.subject_name,s.subject_code,e.exam_date,e.exam_type,u.name AS setter_name,
              v.version_number, (v.version_id IS NOT NULL AND p.storage_path=v.storage_key) AS has_file
       FROM exam_question_papers p
       LEFT JOIN academic_subjects s ON s.subject_id=p.subject_id
       LEFT JOIN exam_schedules e ON e.exam_schedule_id=p.exam_schedule_id AND e.tenant_id=p.tenant_id
       LEFT JOIN users u ON u.user_id=p.setter_user_id AND u.tenant_id=p.tenant_id
       LEFT JOIN LATERAL (SELECT version_id,version_number,storage_key FROM exam_question_paper_versions
          WHERE tenant_id=p.tenant_id AND qp_id=p.qp_id ORDER BY version_number DESC LIMIT 1) v ON true
       WHERE p.tenant_id=$1 AND ($2::text IS NULL OR p.status=$2) ORDER BY p.created_at DESC LIMIT 100`,
      [tenant, status ?? null],
    );
  }

  async create(
    tenant: string,
    actor: string,
    role: string,
    dto: CreateQuestionPaperDto,
  ) {
    this.scope(tenant, actor, role);
    this.validate(CreateQuestionPaperDto, dto);
    return this.db.transaction(async (m) => {
      await this.actor(m, tenant, actor);
      const s = await this.schedule(
        m,
        tenant,
        dto.exam_schedule_id,
        dto.subject_id ?? null,
      );
      if (dto.setter_user_id) {
        const [setter] = await m.query<Array<{ user_id: string }>>(
          'SELECT user_id FROM users WHERE tenant_id=$1 AND user_id=$2 AND is_active=true AND deleted_at IS NULL FOR SHARE',
          [tenant, dto.setter_user_id],
        );
        if (!setter)
          throw new BadRequestException(
            'Setter must be an active user in this tenant',
          );
      }
      const [paper] = await m.query<Paper[]>(
        `INSERT INTO exam_question_papers(tenant_id,exam_schedule_id,subject_id,setter_user_id,notes,created_by,status)
        VALUES($1,$2,$3,$4,$5,$6,'UPLOADED') RETURNING *`,
        [
          tenant,
          dto.exam_schedule_id,
          s.subject_id,
          dto.setter_user_id ?? null,
          dto.notes?.trim() || null,
          actor,
        ],
      );
      await this.audit.log(
        tenant,
        actor,
        {
          action: 'QP_REGISTERED',
          resource_type: 'exam_question_paper',
          resource_id: paper.qp_id,
        },
        m,
      );
      return { qp_id: paper.qp_id, status: paper.status, has_file: false };
    });
  }

  async updateStatus(
    tenant: string,
    id: string,
    actor: string,
    role: string,
    dto: UpdateQuestionPaperStatusDto,
  ) {
    this.scope(tenant, actor, role, id);
    this.validate(UpdateQuestionPaperStatusDto, dto);
    return this.db.transaction(async (m) => {
      await this.actor(m, tenant, actor);
      const p = await this.paper(m, tenant, id);
      if (!NEXT[p.status]?.includes(dto.status))
        throw new ConflictException(
          `Cannot move question paper from ${p.status} to ${dto.status}`,
        );
      const reason = dto.reason?.trim();
      if (dto.status === 'REJECTED' && (!reason || reason.length < 3))
        throw new BadRequestException(
          'A rejection/correction reason is required',
        );
      let version: Version | undefined;
      if (dto.status !== 'REJECTED') {
        await this.schedule(m, tenant, p.exam_schedule_id, p.subject_id);
        version = this.validateVersion(p, await this.current(m, tenant, id));
        if (
          dto.status === 'PRINT_AUTHORIZED' &&
          (!p.approved_by || !p.approved_at)
        )
          throw new ConflictException('COE approval is required');
      }
      await m.query(
        `UPDATE exam_question_papers SET status=$3::varchar,updated_at=clock_timestamp(),
        approved_by=CASE WHEN $3::text='COE_APPROVED' THEN $4::uuid WHEN $3::text='REJECTED' THEN NULL ELSE approved_by END,
        approved_at=CASE WHEN $3::text='COE_APPROVED' THEN clock_timestamp() WHEN $3::text='REJECTED' THEN NULL ELSE approved_at END
        WHERE tenant_id=$1 AND qp_id=$2`,
        [tenant, id, dto.status, actor],
      );
      await this.audit.log(
        tenant,
        actor,
        {
          action: `QP_${dto.status}`,
          resource_type: 'exam_question_paper',
          resource_id: id,
          old_value: { status: p.status },
          new_value: {
            status: dto.status,
            version_id: version?.version_id,
            reason,
          },
        },
        m,
      );
      return { qp_id: id, status: dto.status };
    });
  }

  async upload(
    tenant: string,
    id: string,
    actor: string,
    role: string,
    file: Pick<Express.Multer.File, 'buffer' | 'mimetype'> | undefined,
    dto: UploadQuestionPaperDto,
  ) {
    this.scope(tenant, actor, role, id);
    this.validate(UploadQuestionPaperDto, dto);
    if (
      !file ||
      file.mimetype !== 'application/pdf' ||
      !Buffer.isBuffer(file.buffer) ||
      file.buffer.length < 1 ||
      file.buffer.length > MAX_BYTES
    )
      throw new BadRequestException('Upload a PDF up to 25 MB');
    try {
      if (!(await PDFDocument.load(file.buffer)).getPageCount())
        throw new Error('Empty PDF');
    } catch {
      throw new BadRequestException('Upload a valid, unencrypted PDF');
    }
    const hash = createHash('sha256').update(file.buffer).digest('hex');
    return this.db.transaction(async (m) => {
      await this.actor(m, tenant, actor);
      const p = await this.paper(m, tenant, id);
      if (!['UPLOADED', 'REJECTED'].includes(p.status))
        throw new ConflictException(
          'A moderated, approved or print-authorized version cannot be replaced',
        );
      await this.schedule(m, tenant, p.exam_schedule_id, p.subject_id);
      const previous = await this.current(m, tenant, id);
      if (
        previous &&
        p.status === 'UPLOADED' &&
        previous.document_sha256 === hash &&
        previous.document_bytes === file.buffer.length
      ) {
        this.validateVersion(p, previous);
        return {
          version_id: previous.version_id,
          version_number: previous.version_number,
          status: 'UPLOADED',
        };
      }
      const reason = dto.reason?.trim();
      if (previous && (!reason || reason.length < 3))
        throw new BadRequestException(
          'Explain why a new paper version is required',
        );
      const versionId = randomUUID();
      const key = questionPaperKey(p.tenant_id, p.qp_id, versionId);
      // A file is not official until its version and required audit commit.
      // Never expose orphan keys through generic downloads or presigned URLs.
      try {
        await this.storage.uploadNew(tenant, key, file.buffer, 'application/pdf');
      } catch {
        throw new ServiceUnavailableException(
          'Private paper storage is unavailable; no version was registered',
        );
      }
      const number = (previous?.version_number ?? 0) + 1;
      await m.query(
        `INSERT INTO exam_question_paper_versions(version_id,qp_id,tenant_id,version_number,storage_key,document_sha256,document_bytes,uploaded_by,reason)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          versionId,
          id,
          tenant,
          number,
          key,
          hash,
          file.buffer.length,
          actor,
          reason || null,
        ],
      );
      await m.query(
        `UPDATE exam_question_papers SET storage_path=$3,status='UPLOADED',approved_by=NULL,approved_at=NULL,updated_at=clock_timestamp() WHERE tenant_id=$1 AND qp_id=$2`,
        [tenant, id, key],
      );
      await this.audit.log(
        tenant,
        actor,
        {
          action: 'QP_UPLOADED',
          resource_type: 'exam_question_paper',
          resource_id: id,
          new_value: {
            version_id: versionId,
            version_number: number,
            document_sha256: hash,
            reason,
          },
        },
        m,
      );
      return {
        version_id: versionId,
        version_number: number,
        status: 'UPLOADED',
      };
    });
  }

  async versions(tenant: string, id: string, actor: string, role: string) {
    this.scope(tenant, actor, role, id);
    await this.actor(this.db.manager, tenant, actor);
    const [p] = await this.db.query<Paper[]>(
      'SELECT qp_id FROM exam_question_papers WHERE tenant_id=$1 AND qp_id=$2',
      [tenant, id],
    );
    if (!p) throw new NotFoundException('Question paper not found');
    return this.db.query<Array<Omit<Version, 'storage_key'>>>(
      `SELECT version_id,qp_id,tenant_id,version_number,document_sha256,document_bytes,uploaded_by,uploaded_at,reason
      FROM exam_question_paper_versions WHERE tenant_id=$1 AND qp_id=$2 ORDER BY version_number DESC`,
      [tenant, id],
    );
  }

  async download(
    tenant: string,
    id: string,
    actor: string,
    role: string,
    reviewVersionId?: string,
  ) {
    this.scope(tenant, actor, role, id);
    if (reviewVersionId !== undefined && !isUUID(reviewVersionId))
      throw new BadRequestException('Valid paper version required');
    return this.db.transaction(async (m) => {
      await this.actor(m, tenant, actor);
      const p = await this.paper(m, tenant, id);
      if (!reviewVersionId && p.status !== 'PRINT_AUTHORIZED')
        throw new ForbiddenException(
          'Paper has not been authorized for printing',
        );
      const active = this.validateVersion(p, await this.current(m, tenant, id));
      let v = active;
      if (reviewVersionId) {
        const [historical] = await m.query<Version[]>(
          'SELECT * FROM exam_question_paper_versions WHERE tenant_id=$1 AND qp_id=$2 AND version_id=$3',
          [tenant, id, reviewVersionId],
        );
        if (!historical) throw new NotFoundException('Paper version not found');
        this.validateVersion(
          { ...p, storage_path: historical.storage_key },
          historical,
        );
        v = historical;
      } else {
        await this.schedule(m, tenant, p.exam_schedule_id, p.subject_id);
        if (!p.approved_by || !p.approved_at)
          throw new ForbiddenException('COE approval is required');
      }
      let buffer: Buffer;
      try {
        const stream = await this.storage.getDownloadStream(v.storage_key);
        const parts: Buffer[] = [];
        let size = 0;
        for await (const part of stream) {
          const b = Buffer.isBuffer(part)
            ? part
            : Buffer.from(part as Uint8Array);
          size += b.length;
          if (size > v.document_bytes) throw new Error('File size mismatch');
          parts.push(b);
        }
        buffer = Buffer.concat(parts);
        if (
          buffer.length !== v.document_bytes ||
          createHash('sha256').update(buffer).digest('hex') !==
            v.document_sha256
        )
          throw new Error('File integrity mismatch');
      } catch {
        throw new ServiceUnavailableException(
          'Verified paper file is unavailable',
        );
      }
      await this.audit.log(
        tenant,
        actor,
        {
          action: reviewVersionId ? 'QP_FILE_REVIEWED' : 'QP_RELEASED',
          resource_type: 'exam_question_paper',
          resource_id: id,
          new_value: {
            version_id: v.version_id,
            version_number: v.version_number,
          },
        },
        m,
      );
      return {
        buffer,
        filename: `question-paper-${id}-v${v.version_number}.pdf`,
      };
    });
  }
}
