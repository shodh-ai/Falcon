import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { isUUID, validateSync } from 'class-validator';
import { DataSource } from 'typeorm';
import { requireTenantId } from '../../common/utils/require-tenant-id';
import { ExamCellAuditService } from './exam-cell-audit.service';
import {
  CreateExamSessionDto,
  UpdateExamSessionStatusDto,
  type ExamSessionStatus,
} from './dto/exam-session.dto';

export type { ExamSessionCycle } from './dto/exam-session.dto';

type ExamSessionRow = {
  session_id: string;
  tenant_id: string;
  status: ExamSessionStatus;
  [key: string]: unknown;
};

@Injectable()
export class ExamCellSessionsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly audit: ExamCellAuditService,
  ) {}

  listSessions(tenantId: string) {
    return this.db.query(
      `SELECT * FROM exam_sessions WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [this.tenant(tenantId)],
    );
  }

  async createSession(
    tenantId: string,
    userId: string,
    dto: CreateExamSessionDto,
  ) {
    const tid = this.tenant(tenantId);
    const input = plainToInstance(CreateExamSessionDto, dto);
    this.validateInput(input);
    if (
      input.start_date &&
      input.end_date &&
      input.end_date < input.start_date
    ) {
      throw new BadRequestException('End date must not be before start date');
    }
    const configuration = [
      tid,
      input.academic_year,
      input.session_name,
      input.cycle_type,
      input.semester ?? null,
      input.program_label ?? null,
      input.start_date ?? null,
      input.end_date ?? null,
    ];

    return this.db.transaction(async (manager) => {
      // Serialize identical configurations, not all sessions with the same name.
      // This reuses the project's PostgreSQL transaction advisory-lock pattern.
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`exam-session:${JSON.stringify(configuration)}`],
      );
      const existing = await manager.query<ExamSessionRow[]>(
        `SELECT session_id FROM exam_sessions
         WHERE tenant_id = $1 AND academic_year = $2 AND session_name = $3
           AND cycle_type = $4 AND semester IS NOT DISTINCT FROM $5::int
           AND program_label IS NOT DISTINCT FROM $6::varchar
           AND start_date IS NOT DISTINCT FROM $7::date
           AND end_date IS NOT DISTINCT FROM $8::date`,
        configuration,
      );
      if (existing.length) {
        throw new ConflictException(
          'An identical examination session already exists',
        );
      }
      const [row] = await manager.query<ExamSessionRow[]>(
        `INSERT INTO exam_sessions
         (tenant_id, academic_year, session_name, cycle_type, semester, program_label,
          start_date, end_date, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'DRAFT',$9)
       RETURNING *`,
        [...configuration, userId],
      );
      await this.audit.log(
        tid,
        userId,
        {
          action: 'EXAM_SESSION_CREATED',
          resource_type: 'exam_session',
          resource_id: row.session_id,
          new_value: row,
        },
        manager,
      );
      return row;
    });
  }

  async updateSessionStatus(
    tenantId: string,
    sessionId: string,
    userId: string,
    status: string,
  ) {
    const tid = this.tenant(tenantId);
    if (!isUUID(sessionId)) {
      throw new BadRequestException(
        'A valid examination session ID is required',
      );
    }
    const input = plainToInstance(UpdateExamSessionStatusDto, { status });
    this.validateInput(input);
    return this.db.transaction(async (manager) => {
      const [current] = await manager.query<ExamSessionRow[]>(
        `SELECT * FROM exam_sessions
         WHERE session_id = $1 AND tenant_id = $2 FOR UPDATE`,
        [sessionId, tid],
      );
      if (!current) throw new NotFoundException('Exam session not found');
      if (current.status === input.status) return current;

      const nextStatus: Partial<Record<ExamSessionStatus, ExamSessionStatus>> =
        {
          DRAFT: 'OPEN',
          OPEN: 'ACTIVE',
          ACTIVE: 'CLOSED',
        };
      if (nextStatus[current.status] !== input.status) {
        throw new BadRequestException(
          `Cannot change examination session from ${current.status} to ${input.status}`,
        );
      }
      const [row] = await manager.query<ExamSessionRow[]>(
        `UPDATE exam_sessions SET status = $3, updated_at = NOW()
       WHERE session_id = $1 AND tenant_id = $2
       RETURNING *`,
        [sessionId, tid, input.status],
      );
      await this.audit.log(
        tid,
        userId,
        {
          action: 'EXAM_SESSION_STATUS_CHANGED',
          resource_type: 'exam_session',
          resource_id: sessionId,
          old_value: { status: current.status },
          new_value: { status: input.status },
        },
        manager,
      );
      return row;
    });
  }

  private tenant(tenantId: string): string {
    const scopedTenantId = requireTenantId(tenantId);
    if (!isUUID(scopedTenantId)) {
      throw new ForbiddenException('Valid tenant context required');
    }
    return scopedTenantId;
  }

  private validateInput(input: object): void {
    const errors = validateSync(input);
    if (errors.length) {
      throw new BadRequestException(
        errors.flatMap((error) => Object.values(error.constraints ?? {})),
      );
    }
  }
}
