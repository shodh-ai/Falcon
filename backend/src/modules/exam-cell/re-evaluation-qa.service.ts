import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { postgresQueryRows } from '../../common/postgres-query-rows';

export const REEVALUATION_QA_IDS = [
  'a1000002-0000-4000-8000-000000000002',
  'a1000003-0000-4000-8000-000000000003',
];

@Injectable()
export class ReEvaluationQaService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  private assertEnabled(id: string) {
    if (
      !['development', 'test'].includes(process.env.NODE_ENV || '') ||
      process.env.REEVALUATION_QA_ENABLED !== 'true' ||
      !['localhost', '127.0.0.1', '::1'].includes(
        process.env.DB_HOST || 'localhost',
      ) ||
      /prod|live/i.test(
        `${process.env.DATABASE_ENV || ''} ${process.env.DEPLOYMENT_ENV || ''}`,
      ) ||
      !REEVALUATION_QA_IDS.includes(id.toLowerCase())
    ) {
      throw new NotFoundException(
        'Local re-evaluation QA workflow is unavailable.',
      );
    }
  }

  private async read(
    db: Pick<DataSource, 'query'>,
    tenant: string,
    id: string,
    faculty?: string,
    lock = false,
  ) {
    this.assertEnabled(id);
    let rows: any[];
    try {
      rows = await db.query(
        `SELECT q.* FROM local_reevaluation_qa.cases q
        JOIN public.exam_applications a ON a.exam_application_id=q.request_id
          AND a.student_user_id=q.student_user_id AND a.deleted_at IS NULL
          AND a.application_type='RE_EVALUATION' AND a.exam_result_id IS NULL
          AND a.fee_status='PAID' AND a.status IN ('ASSIGNED','UNDER_REVIEW')
          AND a.original_marks=q.original_marks
        JOIN public.users u ON u.user_id=q.student_user_id AND u.tenant_id=q.tenant_id
          AND u.deleted_at IS NULL AND u.is_active=true
          AND lower(u.official_email)='student4@mygyanvihar.com'
        JOIN public.academic_subjects s ON s.subject_id=a.subject_id
          AND s.subject_code='SMOKE101' AND s.deleted_at IS NULL
        WHERE q.request_id=$1 AND q.tenant_id=$2 AND q.source='LOCAL_QA'
          AND ($3::uuid IS NULL OR a.assigned_faculty_user_id=$3)
        ${lock ? 'FOR UPDATE OF q FOR SHARE OF a,u' : ''}`,
        [id, tenant, faculty ?? null],
      );
    } catch (error) {
      if (
        ['42P01', '3F000'].includes((error as { code?: string }).code ?? '')
      ) {
        throw new NotFoundException('Local QA fixtures have not been set up.');
      }
      throw error;
    }
    if (!rows[0])
      throw new NotFoundException(
        'Local QA case not found in your assigned workspace.',
      );
    return rows[0];
  }

  private response(row: any) {
    return { ...row, is_qa: true, official_publication: false };
  }

  async get(tenant: string, id: string, faculty?: string) {
    return this.response(await this.read(this.db, tenant, id, faculty));
  }

  async act(
    tenant: string,
    id: string,
    action: 'report' | 'complete' | 'reset',
    version: number,
    actorId: string,
    report?: { revised_marks: number; report_notes: string },
  ) {
    this.assertEnabled(id);
    if (!Number.isInteger(version) || version < 0)
      throw new BadRequestException('A current QA version is required.');
    return this.db.transaction(async (db) => {
      const row = await this.read(
        db,
        tenant,
        id,
        action === 'report' ? actorId : undefined,
        true,
      );
      if (row.version !== version)
        throw new ConflictException(
          'The QA case changed. Reload it before trying again.',
        );
      let assignments: string;
      const params: unknown[] = [id, tenant, version];
      if (action === 'report') {
        const marks = report?.revised_marks;
        const notes = report?.report_notes?.trim();
        if (row.status !== 'ASSIGNED')
          throw new ConflictException(
            'This QA report has already been submitted.',
          );
        if (
          typeof marks !== 'number' ||
          !Number.isFinite(marks) ||
          marks < 0 ||
          marks > Number(row.max_marks) ||
          marks !== Number(marks.toFixed(2)) ||
          !notes ||
          notes.length > 2000
        ) {
          throw new BadRequestException(
            `Enter QA marks from 0 to ${row.max_marks}, with at most two decimals, and report notes up to 2000 characters.`,
          );
        }
        params.push(marks, notes);
        assignments = "revised_marks=$4,report_notes=$5,status='UNDER_REVIEW'";
      } else if (action === 'complete') {
        if (
          row.status !== 'UNDER_REVIEW' ||
          row.revised_marks == null ||
          !row.report_notes?.trim() ||
          !Number.isFinite(Number(row.revised_marks)) ||
          Number(row.revised_marks) < 0 ||
          Number(row.revised_marks) > Number(row.max_marks)
        ) {
          throw new ConflictException(
            'A valid submitted QA report is required first.',
          );
        }
        assignments =
          "result_marks=revised_marks,status='COMPLETED',completed_at=now()";
      } else if (action === 'reset') {
        assignments =
          'status=initial_status,revised_marks=initial_revised_marks,report_notes=initial_report_notes,result_marks=original_marks,completed_at=NULL';
      } else {
        throw new BadRequestException('Unknown QA action.');
      }
      const saved = postgresQueryRows(
        await db.query(
          `UPDATE local_reevaluation_qa.cases
        SET ${assignments},version=version+1,updated_at=now()
        WHERE request_id=$1 AND tenant_id=$2 AND version=$3 AND source='LOCAL_QA' RETURNING *`,
          params,
        ),
      );
      if (saved.length !== 1)
        throw new ConflictException(
          'The QA case changed. Reload it before trying again.',
        );
      return this.response(saved[0]);
    });
  }
}
