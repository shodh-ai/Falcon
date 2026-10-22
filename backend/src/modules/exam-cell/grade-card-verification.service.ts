import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { DataSource } from 'typeorm';

export type GradeCardVerificationSnapshot = {
  grade_card_id: string;
  student_user_id: string;
  tenant_id: string;
  semester: number;
  cgpa: string | number | null;
  status: string;
  published_at: Date | string | null;
  student_name: string;
  enrollment_number: string | null;
  payload: Record<string, unknown> | null;
  has_open_ufm: boolean;
};

type VerificationRecord = GradeCardVerificationSnapshot & {
  revision_hash: string;
  verification_stage: string;
  issued_at: Date | string;
  revoked_at: Date | string | null;
};

function canonicalJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Tokens identify an issued revision; every scan rechecks its current state. */
@Injectable()
export class GradeCardVerificationService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly config: ConfigService,
  ) {}

  private stage(card: GradeCardVerificationSnapshot) {
    const stage = card.payload?.result_stage;
    return card.status === 'PUBLISHED' &&
      !card.has_open_ufm &&
      card.payload?.requires_regeneration !== true &&
      (stage === 'PROVISIONAL' || stage === 'FINAL')
      ? stage
      : null;
  }

  private revisionHash(card: GradeCardVerificationSnapshot) {
    return createHash('sha256')
      .update(
        canonicalJson({
          tenant_id: card.tenant_id,
          grade_card_id: card.grade_card_id,
          student_user_id: card.student_user_id,
          student_name: card.student_name,
          enrollment_number: card.enrollment_number,
          semester: card.semester,
          cgpa: card.cgpa,
          published_at: card.published_at,
          status: card.status,
          payload: card.payload,
        }),
      )
      .digest('hex');
  }

  private publicOrigin() {
    const configured = this.config.get<string>(
      'GRADE_CARD_VERIFICATION_BASE_URL',
    );
    if (!configured) return null;
    try {
      const url = new URL(configured);
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if (
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        (url.pathname !== '/' && url.pathname !== '')
      )
        return null;
      return url.origin;
    } catch {
      return null;
    }
  }

  async issue(
    tenantId: string,
    card: GradeCardVerificationSnapshot,
  ): Promise<{ url: string | null; notice: string }> {
    if (card.tenant_id !== tenantId)
      throw new NotFoundException('Grade card not found');
    const stage = this.stage(card);
    if (!stage)
      return {
        url: null,
        notice:
          'Unverified staff preview - grade card is not currently published for verification.',
      };
    const origin = this.publicOrigin();
    if (!origin)
      return {
        url: null,
        notice:
          'Digital verification unavailable - public verification URL is not configured.',
      };
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    try {
      const inserted = await this.db.query<Array<{ verification_id: string }>>(
        `INSERT INTO grade_card_verifications
         (tenant_id, grade_card_id, token_hash, revision_hash, result_stage)
         SELECT $1, g.grade_card_id, $3, $4, $5 FROM grade_cards g
         JOIN users u ON u.user_id = g.student_user_id AND u.tenant_id = g.tenant_id
         WHERE g.tenant_id = $1 AND g.grade_card_id = $2
         RETURNING verification_id`,
        [
          tenantId,
          card.grade_card_id,
          tokenHash,
          this.revisionHash(card),
          stage,
        ],
      );
      if (!inserted[0]) throw new NotFoundException('Grade card not found');
    } catch (error) {
      if ((error as { code?: string }).code === '42P01') {
        return {
          url: null,
          notice:
            'Digital verification unavailable - verification storage is not initialized.',
        };
      }
      throw error;
    }
    return {
      url: `${origin}/api/verify/grade-card/${token}`,
      notice: `Published ${stage.toLowerCase()} grade card - scan to check current validity.`,
    };
  }

  async verifyPublic(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new NotFoundException('Grade card verification is invalid');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const rows = await this.db.query<VerificationRecord[]>(
      `SELECT g.grade_card_id, g.tenant_id, g.student_user_id, g.semester, g.cgpa,
              g.status, g.published_at, g.payload, u.name AS student_name,
              COALESCE(sp.enrollment_number, sp.enrollment_no) AS enrollment_number,
              v.revision_hash, v.result_stage AS verification_stage, v.issued_at, v.revoked_at,
              EXISTS (SELECT 1 FROM ufm_cases ufm WHERE ufm.tenant_id = g.tenant_id
                      AND ufm.student_user_id = g.student_user_id
                      AND ufm.status <> 'CLOSED' AND ufm.marks_locked = true) AS has_open_ufm
       FROM grade_card_verifications v
       JOIN grade_cards g ON g.grade_card_id = v.grade_card_id AND g.tenant_id = v.tenant_id
       JOIN users u ON u.user_id = g.student_user_id AND u.tenant_id = g.tenant_id
       LEFT JOIN student_profiles sp ON sp.user_id = g.student_user_id
       WHERE v.token_hash = $1 LIMIT 1`,
      [tokenHash],
    );
    const record = rows[0];
    const stage = record && this.stage(record);
    const currentHash = record && this.revisionHash(record);
    if (
      !record ||
      record.revoked_at ||
      !stage ||
      stage !== record.verification_stage ||
      !/^[a-f0-9]{64}$/.test(record.revision_hash) ||
      !currentHash ||
      !timingSafeEqual(
        Buffer.from(record.revision_hash, 'hex'),
        Buffer.from(currentHash, 'hex'),
      )
    ) {
      throw new NotFoundException('Grade card verification is invalid');
    }
    return {
      valid: true,
      document_type: 'SEMESTER_GRADE_CARD',
      semester: record.semester,
      result_stage: stage,
      issued_at: record.issued_at,
    };
  }
}
