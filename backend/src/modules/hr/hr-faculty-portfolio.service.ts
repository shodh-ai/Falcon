import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export const FACULTY_WORK_TYPES = [
  'TEACHING', 'RESEARCH', 'PUBLICATION', 'TRAINING',
  'SERVICE', 'MENTORING', 'AWARD', 'OTHER',
] as const;

export type FacultyWorkType = (typeof FACULTY_WORK_TYPES)[number];
type WorkType = FacultyWorkType;
type EventType = 'SKILL_ADDED' | 'SKILL_REMOVED' | 'WORK_COMPLETED';

@Injectable()
export class HrFacultyPortfolioService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  private async assertFaculty(tenantId: string, facultyUserId: string, entityId?: number) {
    const rows = await this.db.query(
      `SELECT u.user_id FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND u.user_id = $2 AND u.deleted_at IS NULL
         AND r.role_name IN ('Faculty', 'HOD', 'Dean')
         AND ($3::int IS NULL OR u.entity_id = $3)`,
      [tenantId, facultyUserId, entityId ?? null],
    );
    if (!rows.length) throw new NotFoundException('Faculty member not found in scope');
  }

  async list(tenantId: string, facultyUserId: string, entityId?: number) {
    await this.assertFaculty(tenantId, facultyUserId, entityId);
    const events = await this.db.query(
      `SELECT e.event_id, e.event_type, e.skill_keyword, e.work_type, e.title,
              e.description, e.completed_on, e.evidence_url, e.created_at,
              e.actor_user_id, actor.name AS recorded_by_name
       FROM faculty_portfolio_events e
       JOIN users actor ON actor.user_id = e.actor_user_id AND actor.tenant_id = e.tenant_id
       WHERE e.tenant_id = $1 AND e.faculty_user_id = $2
       ORDER BY e.event_sequence ASC`,
      [tenantId, facultyUserId],
    );
    const active = new Map<string, string>();
    for (const event of events) {
      if (!event.skill_keyword) continue;
      const key = String(event.skill_keyword).toLocaleLowerCase('en-IN');
      if (event.event_type === 'SKILL_ADDED') active.set(key, event.skill_keyword);
      if (event.event_type === 'SKILL_REMOVED') active.delete(key);
    }
    return {
      skills: [...active.values()].sort((a, b) => a.localeCompare(b)),
      work: events.filter((event: { event_type: EventType }) => event.event_type === 'WORK_COMPLETED').reverse(),
      history: events.filter((event: { event_type: EventType }) => event.event_type !== 'WORK_COMPLETED').reverse(),
    };
  }

  async addSkill(tenantId: string, facultyUserId: string, actorUserId: string,
    keyword: string, idempotencyKey: string, entityId?: number) {
    const skill = keyword?.trim().replace(/\s+/g, ' ');
    if (!skill || skill.length > 60 || !/^[\p{L}\p{N}+#./()& -]+$/u.test(skill)) {
      throw new BadRequestException('Skill keyword must be 1–60 readable characters');
    }
    await this.append(tenantId, facultyUserId, actorUserId, idempotencyKey,
      { event_type: 'SKILL_ADDED', skill_keyword: skill }, entityId);
    return this.list(tenantId, facultyUserId, entityId);
  }

  async removeSkill(tenantId: string, facultyUserId: string, actorUserId: string,
    keyword: string, idempotencyKey: string, entityId?: number) {
    const skill = keyword?.trim();
    if (!skill || skill.length > 60) throw new BadRequestException('Skill keyword is required');
    await this.append(tenantId, facultyUserId, actorUserId, idempotencyKey,
      { event_type: 'SKILL_REMOVED', skill_keyword: skill }, entityId);
    return this.list(tenantId, facultyUserId, entityId);
  }

  async addWork(tenantId: string, facultyUserId: string, actorUserId: string,
    input: { work_type: WorkType; title: string; description?: string;
      completed_on: string; evidence_url?: string }, idempotencyKey: string, entityId?: number) {
    const title = input.title?.trim();
    const description = input.description?.trim() || null;
    const evidenceUrl = input.evidence_url?.trim() || null;
    if (!FACULTY_WORK_TYPES.includes(input.work_type)) throw new BadRequestException('Invalid work type');
    if (!title || title.length > 180) throw new BadRequestException('Work title is required (max 180 characters)');
    if (description && description.length > 4000) throw new BadRequestException('Description is too long');
    const completedMs = Date.parse(`${input.completed_on}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.completed_on) ||
        !Number.isFinite(completedMs) ||
        new Date(completedMs).toISOString().slice(0, 10) !== input.completed_on ||
        completedMs > Date.now() + 24 * 60 * 60 * 1000) {
      throw new BadRequestException('Use a valid completion date that is not in the future');
    }
    if (evidenceUrl && (evidenceUrl.length > 1000 || !/^https:\/\//i.test(evidenceUrl))) {
      throw new BadRequestException('Evidence link must be a secure HTTPS URL');
    }
    await this.append(tenantId, facultyUserId, actorUserId, idempotencyKey,
      { event_type: 'WORK_COMPLETED', work_type: input.work_type, title,
        description, completed_on: input.completed_on, evidence_url: evidenceUrl }, entityId);
    return this.list(tenantId, facultyUserId, entityId);
  }

  private async append(tenantId: string, facultyUserId: string, actorUserId: string,
    key: string, event: { event_type: EventType; skill_keyword?: string; work_type?: WorkType;
      title?: string; description?: string | null; completed_on?: string; evidence_url?: string | null },
    entityId?: number) {
    if (!key?.trim() || key.length > 120) throw new BadRequestException('Idempotency-Key is required');
    await this.assertFaculty(tenantId, facultyUserId, entityId);
    const payload = JSON.stringify(event);
    const inserted = await this.db.query(
      `INSERT INTO faculty_portfolio_events
       (tenant_id, faculty_user_id, actor_user_id, idempotency_key, event_type,
        skill_keyword, work_type, title, description, completed_on, evidence_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (tenant_id, actor_user_id, idempotency_key) DO NOTHING
       RETURNING event_id`,
      [tenantId, facultyUserId, actorUserId, key, event.event_type,
        event.skill_keyword ?? null, event.work_type ?? null, event.title ?? null,
        event.description ?? null, event.completed_on ?? null, event.evidence_url ?? null],
    );
    if (!inserted.length) {
      const [row] = await this.db.query(
        `SELECT faculty_user_id, event_type, skill_keyword, work_type, title,
                description, completed_on, evidence_url
         FROM faculty_portfolio_events
         WHERE tenant_id = $1 AND actor_user_id = $2 AND idempotency_key = $3`,
        [tenantId, actorUserId, key],
      );
      if (!row) throw new ConflictException('Could not reconcile portfolio retry');
      const old = JSON.stringify({ event_type: row.event_type,
        ...(row.skill_keyword ? { skill_keyword: row.skill_keyword } : {}),
        ...(row.work_type ? { work_type: row.work_type, title: row.title,
          description: row.description,
          completed_on: row.completed_on instanceof Date
            ? row.completed_on.toISOString().slice(0, 10)
            : String(row.completed_on).slice(0, 10),
          evidence_url: row.evidence_url } : {}) });
      if (row.faculty_user_id !== facultyUserId || old !== payload) {
        throw new ConflictException('Idempotency-Key was used with different details');
      }
    }
  }
}
