import { Injectable, NotFoundException } from '@nestjs/common';
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
    const [row] = await this.db.query(
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
        dto.start_date ?? null,
        dto.end_date ?? null,
        dto.status ?? 'DRAFT',
        userId,
      ],
    );
    await this.audit.log(tenantId, userId, {
      action: 'EXAM_SESSION_CREATED',
      resource_type: 'exam_session',
      resource_id: row.session_id,
      new_value: row,
    });
    return row;
  }

  async updateSessionStatus(
    tenantId: string,
    sessionId: string,
    userId: string,
    status: string,
  ) {
    const [row] = await this.db.query(
      `UPDATE exam_sessions SET status = $3, updated_at = NOW()
       WHERE session_id = $1 AND tenant_id = $2
       RETURNING *`,
      [sessionId, tenantId, status],
    );
    if (!row) throw new NotFoundException('Exam session not found');
    await this.audit.log(tenantId, userId, {
      action: 'EXAM_SESSION_STATUS_CHANGED',
      resource_type: 'exam_session',
      resource_id: sessionId,
      new_value: { status },
    });
    return row;
  }
}
