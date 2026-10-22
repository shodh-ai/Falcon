import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ExamCellAuditService } from './exam-cell-audit.service';

export type ExamSessionCycle =
  | 'ODD_SEMESTER'
  | 'EVEN_SEMESTER'
  | 'MID_SEMESTER'
  | 'END_SEMESTER'
  | 'SUPPLEMENTARY'
  | 'IMPROVEMENT'
  | 'BACK_PAPER'
  | 'PRACTICAL'
  | 'VIVA';

type ExamSessionRow = { session_id: string; [field: string]: unknown };

@Injectable()
export class ExamCellSessionsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly audit: ExamCellAuditService,
  ) {}

  listSessions(tenantId: string) {
    return this.db.query(
      `SELECT * FROM exam_sessions WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId],
    );
  }

  async createSession(
    tenantId: string,
    userId: string,
    dto: {
      academic_year: string;
      session_name: string;
      cycle_type: ExamSessionCycle;
      semester?: number;
      program_label?: string;
      start_date?: string;
      end_date?: string;
      status?: string;
    },
  ) {
    const startDate = this.optionalDate(dto.start_date, 'start_date');
    const endDate = this.optionalDate(dto.end_date, 'end_date');
    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException('End date must be on or after start date');
    }
    return this.db.transaction(async (manager) => {
      const [row] = await manager.query<ExamSessionRow[]>(
        `INSERT INTO exam_sessions
         (tenant_id, academic_year, session_name, cycle_type, semester, program_label,
          start_date, end_date, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
        [
          tenantId,
          dto.academic_year,
          dto.session_name,
          dto.cycle_type,
          dto.semester ?? null,
          dto.program_label ?? null,
          startDate,
          endDate,
          dto.status ?? 'DRAFT',
          userId,
        ],
      );
      await this.audit.log(
        tenantId,
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

  private optionalDate(
    value: string | undefined,
    field: string,
  ): string | null {
    if (value == null || value === '') return null;
    if (
      typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) ||
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException(
        `${field} must be a valid date (YYYY-MM-DD)`,
      );
    }
    return value;
  }

  async updateSessionStatus(
    tenantId: string,
    sessionId: string,
    userId: string,
    status: string,
  ) {
    return this.db.transaction(async (manager) => {
      const [row] = await manager.query<ExamSessionRow[]>(
        `WITH updated AS (UPDATE exam_sessions SET status = $3, updated_at = NOW()
         WHERE session_id = $1 AND tenant_id = $2
         RETURNING *) SELECT * FROM updated`,
        [sessionId, tenantId, status],
      );
      if (!row) throw new NotFoundException('Exam session not found');
      await this.audit.log(
        tenantId,
        userId,
        {
          action: 'EXAM_SESSION_STATUS_CHANGED',
          resource_type: 'exam_session',
          resource_id: sessionId,
          new_value: { status },
        },
        manager,
      );
      return row;
    });
  }
}
