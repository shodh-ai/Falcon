import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { CampusScopeService, type ScopedAuthUser } from '../../common/campus-scope/campus-scope.service';
import { STAFF_ONBOARDING_DOC_TYPES } from './onboarding-portal.util';
import { StaffProfileReviewNotificationService } from './staff-profile-review-notification.service';
import { ObjectStorageService } from '../../storage/object-storage.service';
import { assertRecoveryComplete, invalidRecoveryFields, recoveryValues, STAFF_RECOVERY_REQUIRED_FIELDS } from './staff-profile-recovery.util';

type Db = Pick<DataSource, 'query'> | Pick<QueryRunner, 'query'>;
type Review = {
  review_id: string;
  tenant_id: string;
  user_id: string;
  source: string;
  status: 'PENDING_HR' | 'RETURNED_FOR_CORRECTION' | 'APPROVED';
  revision: number;
  requested_fields: string[];
  requested_docs: string[];
  return_reason: string | null;
  submitted_snapshot_hash: string;
  documents_deferred?: boolean;
  recovery_required?: boolean;
};

const PROFILE_FIELDS = new Set([
  'blood_group', 'staff_mobile', 'pan_number', 'aadhaar_number',
  'bank_account_no', 'ifsc_code', 'pf_uan', 'gender', 'date_of_birth',
  'emergency_contact_name', 'emergency_contact_phone', 'permanent_address',
  'current_address', 'orcid_id', 'scopus_id', 'google_scholar_url',
  'total_experience_years', 'industry_experience_years', 'degree_level',
  'degree_name', 'university', 'passing_year', 'specialization',
]);
const QUALIFICATION_FIELDS = new Set([
  'degree_level', 'degree_name', 'university', 'passing_year', 'specialization',
]);
export const STAFF_PROFILE_REVIEW_FIELDS = [...PROFILE_FIELDS];

@Injectable()
export class StaffProfileReviewService {
  constructor(
    private readonly db: DataSource,
    private readonly campusScope: CampusScopeService,
    private readonly reviewNotifications: StaffProfileReviewNotificationService,
    @Optional() private readonly objectStorage?: ObjectStorageService,
  ) {}

  private hash(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  async snapshot(tenantId: string, userId: string, db: Db = this.db) {
    const [user] = await db.query(
      `SELECT u.onboarding_profile, u.onboarding_status, u.phone, u.dept_id,
              r.role_name, u.official_email
       FROM users u JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND u.user_id = $2 AND u.deleted_at IS NULL`,
      [tenantId, userId],
    );
    if (!user || !['faculty', 'hod', 'dean'].includes(String(user.role_name).toLowerCase())) {
      throw new NotFoundException('Staff profile not found');
    }
    const docs = await db.query(
      `SELECT doc_type, file_path, status, uploaded_at
       FROM staff_onboarding_docs WHERE tenant_id = $1 AND staff_user_id = $2
       ORDER BY doc_type`,
      [tenantId, userId],
    );
    const profile = user.onboarding_profile ?? {};
    const documentManifest = docs.map((doc: Record<string, unknown>) => ({
      doc_type: doc.doc_type,
      file_path: doc.file_path,
      status: doc.status,
      uploaded_at: doc.uploaded_at,
    }));
    return {
      user,
      profile,
      documentManifest,
      hash: this.hash({ profile, documents: documentManifest }),
    };
  }

  async activeReview(tenantId: string, userId: string, db: Db = this.db, lock = false): Promise<Review | null> {
    const rows = await db.query(
      `SELECT * FROM staff_profile_reviews
       WHERE tenant_id = $1 AND user_id = $2
         AND status IN ('PENDING_HR', 'RETURNED_FOR_CORRECTION')
       ${lock ? 'FOR UPDATE' : ''}`,
      [tenantId, userId],
    );
    return rows[0] ?? null;
  }

  async appendEvent(
    db: Db, review: Review, eventType: string, actorId: string | null,
    reason?: string | null,
  ) {
    const snapshot = await this.snapshot(review.tenant_id, review.user_id, db);
    await db.query(
      `INSERT INTO staff_profile_review_events
       (review_id, tenant_id, user_id, revision, event_type, actor_user_id,
        reason, profile_snapshot, document_manifest, snapshot_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)`,
      [review.review_id, review.tenant_id, review.user_id, review.revision,
        eventType, actorId, reason ?? null, JSON.stringify(snapshot.profile),
        JSON.stringify(snapshot.documentManifest), snapshot.hash],
    );
    return snapshot.hash;
  }

  async open(tenantId: string, userId: string, source: 'INITIAL' | 'PHARMACY_RECHECK', actorId: string | null, db: Db = this.db) {
    const existing = await this.activeReview(tenantId, userId, db);
    if (existing) return existing;
    const snapshot = await this.snapshot(tenantId, userId, db);
    const [review] = await db.query(
      `INSERT INTO staff_profile_reviews
       (tenant_id, user_id, source, status, submitted_snapshot_hash)
       VALUES ($1, $2, $3, 'PENDING_HR', $4)
       ON CONFLICT (tenant_id, user_id)
         WHERE status IN ('PENDING_HR', 'RETURNED_FOR_CORRECTION')
       DO NOTHING RETURNING *`,
      [tenantId, userId, source, snapshot.hash],
    );
    const active = review ?? await this.activeReview(tenantId, userId, db);
    if (!active) throw new ConflictException('Could not open staff review');
    if (review) await this.appendEvent(db, active, 'OPENED', actorId);
    return active as Review;
  }

  async me(tenantId: string, userId: string) {
    const rows = await this.db.query(
      `SELECT review_id, source, status, revision, requested_fields,
              requested_docs, return_reason, updated_at, documents_deferred, recovery_required,
              CASE WHEN status <> 'APPROVED' THEN 'NOT_REVIEWED'
                WHEN documents_deferred AND NOT EXISTS (
                  SELECT 1 FROM staff_profile_document_verifications dv
                  WHERE dv.review_id = staff_profile_reviews.review_id
                    AND dv.tenant_id = staff_profile_reviews.tenant_id
                ) THEN 'PENDING' ELSE 'VERIFIED' END AS document_review_status
       FROM staff_profile_reviews WHERE tenant_id = $1 AND user_id = $2
       ORDER BY CASE WHEN status IN ('PENDING_HR', 'RETURNED_FOR_CORRECTION') THEN 0 ELSE 1 END,
                created_at DESC, review_id DESC LIMIT 1`,
      [tenantId, userId],
    );
    const review = rows[0];
    if (!review) return { status: 'NOT_REQUIRED' };
    const edits = review.status === 'RETURNED_FOR_CORRECTION'
      ? await this.db.query(
        `SELECT reason, event_type, document_manifest FROM staff_profile_review_events
         WHERE review_id = $1 AND tenant_id = $2
           AND event_type IN ('BEFORE_PROFILE_CORRECTION', 'BEFORE_DOCUMENT_CORRECTION')
           AND revision > COALESCE((
             SELECT MAX(revision) FROM staff_profile_review_events
             WHERE review_id = $1 AND event_type IN ('RETURNED', 'RECOVERY_OPENED')
           ), 0)`,
        [review.review_id, tenantId],
      ) : [];
    const recovery = review.recovery_required ? await this.snapshot(tenantId, userId) : null;
    return {
      ...review,
      ...(recovery ? {
        profile: recoveryValues(recovery.profile, recovery.user.phone),
        required_fields: STAFF_RECOVERY_REQUIRED_FIELDS,
        missing_fields: invalidRecoveryFields(recovery.profile, recovery.user.phone),
      } : {}),
      corrected_fields: [...new Set(edits.filter((event: { event_type: string }) =>
        event.event_type === 'BEFORE_PROFILE_CORRECTION').flatMap((event: { reason: string | null }) =>
        String(event.reason ?? '').split(',').filter(Boolean)))],
      corrected_docs: [...new Set(edits.filter((event: { event_type: string }) =>
        event.event_type === 'BEFORE_DOCUMENT_CORRECTION').map((event: { reason: string | null }) => event.reason).filter(Boolean))],
    };
  }

  async queue(tenantId: string, departmentId?: number, actor?: ScopedAuthUser) {
    const campusIds = actor ? await this.campusScope.resolveCampusIds(actor) : null;
    if (campusIds && !campusIds.length) throw new ForbiddenException('No assigned campus');
    const reviews = await this.db.query(
      `SELECT v.review_id, v.user_id, v.status, v.source, v.revision,
              v.created_at, v.updated_at, u.name, u.official_email,
              u.onboarding_status, u.dept_id, d.dept_name, r.role_name,
              v.documents_deferred, v.recovery_required,
              CASE WHEN v.status <> 'APPROVED' THEN 'NOT_REVIEWED'
                WHEN v.documents_deferred AND dv.verification_id IS NULL THEN 'PENDING'
                ELSE 'VERIFIED' END AS document_review_status
       FROM staff_profile_reviews v
       LEFT JOIN staff_profile_document_verifications dv
         ON dv.review_id = v.review_id AND dv.tenant_id = v.tenant_id
       JOIN users u ON u.user_id = v.user_id AND u.tenant_id = v.tenant_id
       JOIN roles r ON r.role_id = u.role_id
       JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
       JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
       WHERE v.tenant_id = $1 AND ($2::int IS NULL OR u.dept_id = $2)
         AND ($3::int[] IS NULL OR s.campus_id = ANY($3::int[]))
       ORDER BY CASE WHEN v.status = 'PENDING_HR' THEN 0 ELSE 1 END,
                v.updated_at DESC LIMIT 500`,
      [tenantId, departmentId ?? null, campusIds],
    );
    const awaiting = await this.db.query(
      `SELECT NULL::uuid AS review_id, u.user_id,
              'AWAITING_SUBMISSION' AS status, 'INITIAL' AS source,
              0 AS revision, u.created_at, u.updated_at, u.name,
              u.official_email, u.onboarding_status, u.dept_id,
              d.dept_name, r.role_name
       FROM users u JOIN roles r ON r.role_id = u.role_id
       JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
       JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
       WHERE u.tenant_id = $1 AND u.deleted_at IS NULL AND u.is_active = true
         AND lower(r.role_name) IN ('faculty', 'hod', 'dean')
         AND u.onboarding_status IN ('PENDING_DOCUMENTS', 'PENDING_PASSWORD_RESET')
         AND ($2::int IS NULL OR u.dept_id = $2)
         AND ($3::int[] IS NULL OR s.campus_id = ANY($3::int[]))
         AND NOT EXISTS (SELECT 1 FROM staff_profile_reviews v
           WHERE v.tenant_id = u.tenant_id AND v.user_id = u.user_id
             AND v.status IN ('PENDING_HR', 'RETURNED_FOR_CORRECTION'))
       ORDER BY u.updated_at DESC LIMIT 500`,
      [tenantId, departmentId ?? null, campusIds],
    );
    return [...reviews, ...awaiting];
  }

  async importSubmittedStaff(tenantId: string, actorId: string) {
    const rows = await this.db.query(
      `SELECT u.user_id FROM users u JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND u.onboarding_status = 'PENDING_ADMIN_APPROVAL'
         AND u.deleted_at IS NULL AND lower(r.role_name) IN ('faculty', 'hod', 'dean')
         AND NOT EXISTS (
           SELECT 1 FROM staff_profile_reviews v
           WHERE v.tenant_id = u.tenant_id AND v.user_id = u.user_id
             AND v.status IN ('PENDING_HR', 'RETURNED_FOR_CORRECTION')
         ) ORDER BY u.user_id`,
      [tenantId],
    );
    let opened = 0;
    for (const row of rows) {
      await this.open(tenantId, row.user_id, 'INITIAL', actorId);
      opened++;
    }
    return { opened };
  }

  private async pharmacyCohort(tenantId: string, departmentId: number, db: Db = this.db) {
    const [department] = await db.query(
      `SELECT d.dept_id, d.dept_name, s.campus_id
       FROM departments d JOIN schools s ON s.school_id = d.school_id
       WHERE d.dept_id = $1 AND s.deleted_at IS NULL AND d.deleted_at IS NULL`,
      [departmentId],
    );
    if (!department || !/pharm/i.test(department.dept_name)) {
      throw new BadRequestException('Select an exact Pharmacy department ID');
    }
    const people = await db.query(
      `SELECT u.user_id, u.official_email, u.name, u.onboarding_status,
              u.is_active, r.role_name
       FROM users u JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND u.dept_id = $2 AND u.deleted_at IS NULL
         AND u.is_active = true AND lower(r.role_name) IN ('faculty', 'hod', 'dean')
       ORDER BY u.user_id`,
      [tenantId, departmentId],
    );
    const accounts = [] as Array<Record<string, unknown>>;
    for (const person of people) {
      const snapshot = await this.snapshot(tenantId, person.user_id, db);
      accounts.push({ ...person, source_hash: snapshot.hash });
    }
    return { department, accounts, preview_hash: this.hash(accounts) };
  }

  async pharmacyDepartments(tenantId: string) {
    return this.db.query(
      `SELECT d.dept_id, d.dept_name, s.school_name, s.campus_id
       FROM departments d JOIN schools s ON s.school_id = d.school_id
       WHERE d.deleted_at IS NULL AND s.deleted_at IS NULL
         AND lower(d.dept_name) LIKE '%pharm%'
         AND EXISTS (SELECT 1 FROM users u WHERE u.dept_id = d.dept_id AND u.tenant_id = $1)
       ORDER BY s.school_name, d.dept_name`,
      [tenantId],
    );
  }

  async pharmacyPreview(tenantId: string, departmentId: number) {
    return this.pharmacyCohort(tenantId, departmentId);
  }

  async reopenPharmacy(
    tenantId: string, departmentId: number, expectedHash: string,
    backupReference: string, idempotencyKey: string, actorId: string,
  ) {
    if (!backupReference?.trim() || !idempotencyKey?.trim() || !/^[a-f0-9]{64}$/.test(expectedHash)) {
      throw new BadRequestException('Verified backup reference, preview hash and idempotency key are required');
    }
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`staff-review:${tenantId}:${departmentId}`]);
      const [prior] = await qr.query(
        `SELECT batch_id, department_id, preview_hash, backup_reference
         FROM staff_profile_review_batches
         WHERE tenant_id = $1 AND idempotency_key = $2`,
        [tenantId, idempotencyKey],
      );
      if (prior) {
        if (prior.department_id !== departmentId || prior.preview_hash !== expectedHash ||
            prior.backup_reference !== backupReference.trim()) {
          throw new ConflictException('Idempotency key reused with changed payload');
        }
        await qr.commitTransaction();
        return { batch_id: prior.batch_id, replayed: true };
      }
      const [previousCohort] = await qr.query(
        `SELECT batch_id FROM staff_profile_review_batches
         WHERE tenant_id = $1 AND department_id = $2`,
        [tenantId, departmentId],
      );
      if (previousCohort) {
        throw new ConflictException('This Pharmacy department has already been reopened for HR review');
      }
      await qr.query(
        `SELECT u.user_id FROM users u JOIN roles r ON r.role_id = u.role_id
         WHERE u.tenant_id = $1 AND u.dept_id = $2 AND u.deleted_at IS NULL
           AND u.is_active = true AND lower(r.role_name) IN ('faculty', 'hod', 'dean')
         ORDER BY u.user_id FOR UPDATE OF u`,
        [tenantId, departmentId],
      );
      const cohort = await this.pharmacyCohort(tenantId, departmentId, qr);
      if (cohort.preview_hash !== expectedHash) {
        throw new ConflictException('Pharmacy staff roster or profile changed since preview');
      }
      if (!cohort.accounts.length) throw new BadRequestException('No active staff in selected Pharmacy department');
      const [batch] = await qr.query(
        `INSERT INTO staff_profile_review_batches
         (tenant_id, department_id, idempotency_key, preview_hash,
          backup_reference, target_snapshot, created_by)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) RETURNING batch_id`,
        [tenantId, departmentId, idempotencyKey, expectedHash,
          backupReference.trim(), JSON.stringify(cohort.accounts), actorId],
      );
      let opened = 0;
      let awaitingSubmission = 0;
      for (const person of cohort.accounts) {
        const status = String(person.onboarding_status ?? '');
        if (status === 'COMPLETED' || status === 'PENDING_ADMIN_APPROVAL') {
          const existing = await this.activeReview(tenantId, String(person.user_id), qr);
          if (existing && status === 'COMPLETED' && existing.source !== 'PHARMACY_RECHECK') {
            throw new ConflictException(`Existing active HR review for ${person.official_email} must be resolved before recheck`);
          }
          if (!existing) {
            await this.open(tenantId, String(person.user_id),
              status === 'COMPLETED' ? 'PHARMACY_RECHECK' : 'INITIAL', actorId, qr);
            opened++;
          }
        } else {
          awaitingSubmission++;
        }
      }
      await qr.commitTransaction();
      return { batch_id: batch.batch_id, opened, awaiting_submission: awaitingSubmission, replayed: false };
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally { await qr.release(); }
  }

  async detail(tenantId: string, reviewId: string, actor?: ScopedAuthUser) {
    const [review] = await this.db.query(
      `SELECT v.*, u.name, u.official_email, u.onboarding_status, u.dept_id,
              CASE WHEN v.status <> 'APPROVED' THEN 'NOT_REVIEWED'
                WHEN v.documents_deferred AND dv.verification_id IS NULL THEN 'PENDING'
                ELSE 'VERIFIED' END AS document_review_status,
              d.dept_name, r.role_name
       FROM staff_profile_reviews v
       LEFT JOIN staff_profile_document_verifications dv
         ON dv.review_id = v.review_id AND dv.tenant_id = v.tenant_id
       JOIN users u ON u.user_id = v.user_id AND u.tenant_id = v.tenant_id
       JOIN roles r ON r.role_id = u.role_id
       JOIN departments d ON d.dept_id = u.dept_id
       WHERE v.tenant_id = $1 AND v.review_id = $2`,
      [tenantId, reviewId],
    );
    if (!review) throw new NotFoundException('Staff review not found');
    if (actor) {
      await this.campusScope.assertActorCampusAccess(
        actor, await this.campusScope.campusIdForUserDept(review.user_id),
      );
    }
    const snapshot = await this.snapshot(tenantId, review.user_id);
    const events = await this.db.query(
      `SELECT event_type, actor_user_id, reason, snapshot_hash, occurred_at, revision
       FROM staff_profile_review_events
       WHERE review_id = $1 AND tenant_id = $2 ORDER BY revision`,
      [reviewId, tenantId],
    );
    const [emailDelivery] = await this.db.query(
      `SELECT status, sent_at, attempts FROM staff_profile_review_email_outbox
       WHERE tenant_id = $1 AND review_id = $2 ORDER BY revision DESC LIMIT 1`,
      [tenantId, reviewId],
    );
    return { review, profile: { ...snapshot.profile,
      staff_mobile: snapshot.profile.staff_mobile ?? snapshot.user.phone ?? '' }, documents: snapshot.documentManifest,
      events, email_delivery: emailDelivery ?? null };
  }

  // Explicit operational activation only. No migration or login may activate a
  // cohort. Preview/hash + recoverable backup are required even for the pilot.
  async activateRecovery(tenantId: string, userId: string, expectedHash: string, backupReference: string, actorId: string | null) {
    if (!/^[a-f0-9]{64}$/.test(expectedHash) || !backupReference?.trim()) {
      throw new BadRequestException('Exact profile snapshot and verified backup reference are required');
    }
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`staff-recovery:${tenantId}:${userId}`]);
      const [person] = await qr.query(
        `SELECT u.user_id FROM users u JOIN departments d ON d.dept_id = u.dept_id
         JOIN schools s ON s.school_id = d.school_id
         WHERE u.tenant_id = $1 AND u.user_id = $2 AND u.deleted_at IS NULL
           AND u.is_active = true AND d.deleted_at IS NULL AND s.deleted_at IS NULL
           AND lower(d.dept_name) LIKE '%pharm%' FOR UPDATE OF u`, [tenantId, userId],
      );
      if (!person) throw new NotFoundException('Active Pharmacy staff account not found');
      let review = await this.activeReview(tenantId, userId, qr, true);
      if (review?.recovery_required) {
        await qr.commitTransaction();
        return { review_id: review.review_id, replayed: true };
      }
      const snapshot = await this.snapshot(tenantId, userId, qr);
      if (snapshot.hash !== expectedHash) throw new ConflictException('Profile changed after recovery preview');
      const missingDocuments: string[] = [];
      for (const type of STAFF_ONBOARDING_DOC_TYPES) {
        const doc = snapshot.documentManifest.find((item: { doc_type: string }) => item.doc_type === type);
        if (!doc?.file_path) { missingDocuments.push(type); continue; }
        try { await this.documentDigest(tenantId, String(doc.file_path), type); }
        catch { missingDocuments.push(type); }
      }
      const [prior] = await qr.query(
        `SELECT review_id FROM staff_profile_reviews WHERE tenant_id = $1 AND user_id = $2
         AND status = 'APPROVED' ORDER BY created_at DESC LIMIT 1`, [tenantId, userId],
      );
      if (!review) {
        await this.open(tenantId, userId, snapshot.user.onboarding_status === 'COMPLETED' ? 'PHARMACY_RECHECK' : 'INITIAL', actorId, qr);
        review = await this.activeReview(tenantId, userId, qr, true);
      }
      if (!review) throw new ConflictException('Cannot open recovery review');
      const previousEdits = review.status === 'RETURNED_FOR_CORRECTION' ? await qr.query(
        `SELECT event_type, reason FROM staff_profile_review_events
         WHERE tenant_id = $1 AND review_id = $2
           AND event_type IN ('BEFORE_PROFILE_CORRECTION', 'BEFORE_DOCUMENT_CORRECTION')
           AND revision > COALESCE((SELECT MAX(revision) FROM staff_profile_review_events
             WHERE tenant_id = $1 AND review_id = $2 AND event_type = 'RETURNED'), 0)`,
        [tenantId, review.review_id],
      ) : [];
      const completedFields = new Set(previousEdits.filter((event: { event_type: string }) => event.event_type === 'BEFORE_PROFILE_CORRECTION')
        .flatMap((event: { reason: string }) => String(event.reason ?? '').split(',')));
      const completedDocs = new Set(previousEdits.filter((event: { event_type: string }) => event.event_type === 'BEFORE_DOCUMENT_CORRECTION')
        .map((event: { reason: string }) => event.reason));
      const requestedFields = [...new Set([...review.requested_fields.filter(field => !completedFields.has(field)), ...invalidRecoveryFields(snapshot.profile, snapshot.user.phone)])];
      const requestedDocs = [...new Set([...review.requested_docs.filter(type => !completedDocs.has(type)), ...missingDocuments])];
      const reason = 'Please confirm your saved profile, complete important missing details and replace the listed documents. Existing data and earlier decisions are preserved.'
        + (review.return_reason ? ` Existing HR correction note: ${review.return_reason}` : '');
      await qr.query(
        `UPDATE staff_profile_reviews SET recovery_required = true,
           supersedes_review_id = $3, status = 'RETURNED_FOR_CORRECTION',
           requested_fields = $4, requested_docs = $5, return_reason = $6,
           revision = revision + 1, updated_at = NOW()
         WHERE tenant_id = $1 AND review_id = $2`,
        [tenantId, review.review_id, prior?.review_id ?? null, requestedFields, requestedDocs, reason],
      );
      await this.appendEvent(qr, { ...review, revision: review.revision + 1 }, 'RECOVERY_OPENED', actorId, reason);
      await qr.query(
        `INSERT INTO staff_profile_recovery_activations
         (tenant_id, user_id, review_id, original_snapshot_hash, backup_reference, reason, activated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [tenantId, userId, review.review_id, expectedHash, backupReference.trim(), reason, actorId],
      );
      await qr.commitTransaction();
      return { review_id: review.review_id, required_fields: requestedFields, required_documents: requestedDocs, replayed: false };
    } catch (error) { await qr.rollbackTransaction(); throw error; }
    finally { await qr.release(); }
  }

  async inspectRecoveryDocuments(tenantId: string, profile: Record<string, unknown>, phone: unknown, documents: Array<{ doc_type: string; file_path: unknown }>) {
    assertRecoveryComplete(profile, phone);
    const manifest: Array<{ doc_type: string; file_path: string; sha256: string; size: number }> = [];
    for (const type of STAFF_ONBOARDING_DOC_TYPES) {
      const doc = documents.find((item) => item.doc_type === type);
      if (!doc?.file_path) throw new BadRequestException(`Upload the required ${type} document`);
      const path = String(doc.file_path);
      manifest.push({ doc_type: type, file_path: path, ...await this.documentDigest(tenantId, path, type) });
    }
    return manifest;
  }

  assertAllDocumentsReviewed(documents: unknown) {
    if (!Array.isArray(documents) || documents.length !== STAFF_ONBOARDING_DOC_TYPES.length ||
        new Set(documents).size !== STAFF_ONBOARDING_DOC_TYPES.length ||
        documents.some((type) => !(STAFF_ONBOARDING_DOC_TYPES as readonly unknown[]).includes(type))) {
      throw new BadRequestException('Confirm that every required document has been inspected');
    }
  }

  assertAllDetailsReviewed(fields: unknown) {
    if (!Array.isArray(fields) || fields.length !== PROFILE_FIELDS.size || fields.some((field) => typeof field !== 'string' || !PROFILE_FIELDS.has(field)) ||
        new Set(fields).size !== PROFILE_FIELDS.size) {
      throw new BadRequestException('Confirm every profile detail before approving details only');
    }
  }

  // A later document decision never changes the immutable profile approval or
  // re-freezes a faculty account. Bind the decision to the bytes actually read.
  async verifyDocuments(tenantId: string, reviewId: string, actor: ScopedAuthUser, reviewed: unknown) {
    if (![...(actor.roles ?? []), actor.role ?? ''].some((role) => role.toLowerCase() === 'hradmin')) {
      throw new ForbiddenException('Only HR Admin may verify staff documents');
    }
    await this.detail(tenantId, reviewId, actor);
    if (!Array.isArray(reviewed) || reviewed.length !== STAFF_ONBOARDING_DOC_TYPES.length || reviewed.some((type) => !(STAFF_ONBOARDING_DOC_TYPES as readonly unknown[]).includes(type)) ||
        new Set(reviewed).size !== STAFF_ONBOARDING_DOC_TYPES.length) {
      throw new BadRequestException('Confirm all required documents have been inspected');
    }
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const [review] = await qr.query(
        `SELECT * FROM staff_profile_reviews WHERE tenant_id = $1 AND review_id = $2 FOR SHARE`,
        [tenantId, reviewId],
      ) as Review[];
      if (!review) throw new NotFoundException('Staff review not found');
      if (review.user_id === actor.user_id) throw new ForbiddenException('Cannot verify your own documents');
      if (review.status !== 'APPROVED' || !review.documents_deferred) {
        throw new ConflictException('This profile has no deferred document verification');
      }
      const [existing] = await qr.query(
        `SELECT verification_id FROM staff_profile_document_verifications WHERE tenant_id = $1 AND review_id = $2`,
        [tenantId, reviewId],
      );
      if (existing) {
        await qr.commitTransaction();
        return { document_review_status: 'VERIFIED', verification_id: existing.verification_id, replayed: true };
      }
      const docs = await qr.query(
        `SELECT doc_type, file_path FROM staff_onboarding_docs
         WHERE tenant_id = $1 AND staff_user_id = $2 ORDER BY doc_type FOR SHARE`,
        [tenantId, review.user_id],
      ) as Array<{ doc_type: string; file_path: string }>;
      const manifest: Array<{ doc_type: string; file_path: string; sha256: string; size: number }> = [];
      for (const type of STAFF_ONBOARDING_DOC_TYPES) {
        const doc = docs.find((item) => item.doc_type === type);
        if (!doc?.file_path) throw new BadRequestException(`Cannot verify ${type}: document not uploaded`);
        const digest = await this.documentDigest(tenantId, doc.file_path, type);
        manifest.push({ ...doc, ...digest });
      }
      const [decision] = await qr.query(
        `INSERT INTO staff_profile_document_verifications
         (review_id, tenant_id, user_id, verified_by, document_manifest, manifest_hash)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)
         ON CONFLICT (review_id) DO NOTHING RETURNING verification_id`,
        [reviewId, tenantId, review.user_id, actor.user_id, JSON.stringify(manifest), this.hash(manifest)],
      );
      const result = decision ?? (await qr.query(
        `SELECT verification_id FROM staff_profile_document_verifications WHERE tenant_id = $1 AND review_id = $2`,
        [tenantId, reviewId],
      ))[0];
      if (decision) await qr.query(
        `UPDATE staff_onboarding_docs SET status = 'APPROVED', admin_remarks = NULL
         WHERE tenant_id = $1 AND staff_user_id = $2 AND doc_type = ANY($3::text[])`,
        [tenantId, review.user_id, [...STAFF_ONBOARDING_DOC_TYPES]],
      );
      await qr.commitTransaction();
      return { document_review_status: 'VERIFIED', verification_id: result.verification_id };
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally { await qr.release(); }
  }

  async documentDigest(tenantId: string, filePath: string, type: string) {
    try {
      let stream: AsyncIterable<Buffer | string>;
      if (this.objectStorage?.isEnabled()) {
        const prefix = `s3://${this.objectStorage.getBucketName()}/`;
        const key = filePath.startsWith(prefix) ? filePath.slice(prefix.length) : filePath;
        if (!key.startsWith(`${tenantId}/`) || key.includes('..')) throw new Error('Invalid storage key');
        stream = await this.objectStorage.getDownloadStream(key);
      } else {
        const root = await realpath(resolve(process.env.UPLOAD_PATH || './uploads'));
        const location = filePath.startsWith('/uploads/') ? resolve(root, filePath.slice(9)) : resolve(filePath);
        const actual = await realpath(location);
        if (!actual.startsWith(`${root}/${tenantId}/`) || !(await stat(actual)).isFile()) throw new Error('Invalid file');
        stream = createReadStream(actual);
      }
      let size = 0;
      const hash = createHash('sha256');
      for await (const chunk of stream) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > 32 * 1024 * 1024) throw new Error('Document too large');
        hash.update(bytes);
      }
      if (!size) throw new Error('Empty document');
      return { sha256: hash.digest('hex'), size };
    } catch {
      throw new BadRequestException(`Cannot verify ${type}: original document is missing or unreadable`);
    }
  }

  async returnForCorrection(
    tenantId: string, reviewId: string, actorId: string,
    body: { reason?: string; fields?: string[]; documents?: string[]; revision?: number },
  ) {
    const reason = body.reason?.trim();
    const fields = [...new Set(body.fields ?? [])];
    const documents = [...new Set(body.documents ?? [])];
    if (!reason || (!fields.length && !documents.length)) {
      throw new BadRequestException('Reason and at least one field or document are required');
    }
    if (fields.some((field) => !PROFILE_FIELDS.has(field)) ||
        documents.some((doc) => !(STAFF_ONBOARDING_DOC_TYPES as readonly string[]).includes(doc))) {
      throw new BadRequestException('Unknown correction field or document');
    }
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const [review] = await qr.query(
        `SELECT * FROM staff_profile_reviews WHERE tenant_id = $1 AND review_id = $2 FOR UPDATE`,
        [tenantId, reviewId],
      ) as Review[];
      if (!review) throw new NotFoundException('Staff review not found');
      if (review.user_id === actorId) throw new ForbiddenException('Cannot review your own profile');
      if (review.status !== 'PENDING_HR') throw new ConflictException('Review is not awaiting HR');
      if (body.revision !== undefined && body.revision !== review.revision) {
        throw new ConflictException('This profile changed since you opened it. Refresh and review the latest submission before requesting corrections.');
      }
      await qr.query(
        `UPDATE staff_profile_reviews
         SET status = 'RETURNED_FOR_CORRECTION', requested_fields = $3,
             requested_docs = $4, return_reason = $5, revision = revision + 1,
             updated_at = NOW()
         WHERE tenant_id = $1 AND review_id = $2`,
        [tenantId, reviewId, fields, documents, reason],
      );
      await this.appendEvent(qr, { ...review, revision: review.revision + 1 }, 'RETURNED', actorId, reason);
      await this.reviewNotifications.enqueueCorrection(qr,
        { ...review, revision: review.revision + 1 }, { reason, fields, documents });
      await qr.commitTransaction();
      void this.reviewNotifications.deliverPending();
      return { status: 'RETURNED_FOR_CORRECTION', email_status: 'QUEUED' };
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally { await qr.release(); }
  }

  async correctProfile(tenantId: string, userId: string, changes: Record<string, unknown>) {
    const keys = Object.keys(changes);
    if (!keys.length) throw new BadRequestException('No corrections supplied');
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const review = await this.activeReview(tenantId, userId, qr, true);
      if (!review || review.status !== 'RETURNED_FOR_CORRECTION') {
        throw new ConflictException('No profile corrections requested by HR');
      }
      if (keys.some((key) => review.recovery_required ? !PROFILE_FIELDS.has(key) : !review.requested_fields.includes(key))) {
        throw new ForbiddenException('Only fields requested by HR may be changed');
      }
      const before = await this.snapshot(tenantId, userId, qr);
      const effectiveKeys: string[] = [];
      const merged = { ...before.profile } as Record<string, unknown>;
      const qualification = { ...(merged.qualification as Record<string, unknown> ?? {}) };
      for (const [key, value] of Object.entries(changes)) {
        if (typeof value !== 'string' && typeof value !== 'number') throw new BadRequestException(`${key} must be a text or numeric value`);
        if (value == null || String(value).trim() === '') throw new BadRequestException(`${key} cannot be empty`);
        if (['total_experience_years', 'industry_experience_years'].includes(key) &&
            (!Number.isFinite(Number(value)) || Number(value) < 0)) {
          throw new BadRequestException(`${key} must be a non-negative number`);
        }
        if (key === 'passing_year' &&
            (!Number.isInteger(Number(value)) || Number(value) < 1950 ||
              Number(value) > new Date().getFullYear() + 1)) {
          throw new BadRequestException('passing_year must be a valid year');
        }
        if (key === 'date_of_birth' && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
          throw new BadRequestException('date_of_birth must use YYYY-MM-DD');
        }
        if (['google_scholar_url'].includes(key) && !/^https:\/\//i.test(String(value))) {
          throw new BadRequestException(`${key} must be an HTTPS URL`);
        }
        const current = QUALIFICATION_FIELDS.has(key) ? qualification[key] : merged[key];
        if (String(current ?? '') === String(value)) {
          if (review.recovery_required) continue;
          throw new BadRequestException(`${key} has not changed`);
        }
        effectiveKeys.push(key);
        if (QUALIFICATION_FIELDS.has(key)) qualification[key] = value;
        else merged[key] = value;
      }
      if (!effectiveKeys.length) {
        await qr.commitTransaction();
        return { status: review.status, revision: review.revision, replayed: true };
      }
      await this.appendEvent(qr, { ...review, revision: review.revision + 1 },
        'BEFORE_PROFILE_CORRECTION', userId, effectiveKeys.join(','));
      merged.qualification = qualification;
      await qr.query(
        `UPDATE users SET onboarding_profile = $3::jsonb,
                phone = COALESCE($4, phone), updated_at = NOW()
         WHERE tenant_id = $1 AND user_id = $2`,
        [tenantId, userId, JSON.stringify(merged),
          changes.staff_mobile ? String(changes.staff_mobile) : null],
      );
      await qr.query(
        `UPDATE staff_profile_reviews SET revision = revision + 1, updated_at = NOW()
         WHERE review_id = $1`, [review.review_id],
      );
      await qr.commitTransaction();
      return { status: review.status, revision: review.revision + 1 };
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally { await qr.release(); }
  }

  async correctDocument(tenantId: string, userId: string, docType: string, filePath: string) {
    if (!(STAFF_ONBOARDING_DOC_TYPES as readonly string[]).includes(docType)) {
      throw new BadRequestException('Invalid document type');
    }
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const review = await this.activeReview(tenantId, userId, qr, true);
      if (!review || review.status !== 'RETURNED_FOR_CORRECTION' ||
          !review.requested_docs.includes(docType)) {
        throw new ForbiddenException('HR has not requested this document');
      }
      if (review.recovery_required) await this.documentDigest(tenantId, filePath, docType);
      await this.appendEvent(qr, { ...review, revision: review.revision + 1 }, 'BEFORE_DOCUMENT_CORRECTION', userId, docType);
      await qr.query(
        `INSERT INTO staff_onboarding_docs (tenant_id, staff_user_id, doc_type, file_path, status)
         VALUES ($1, $2, $3, $4, 'PENDING')
         ON CONFLICT (staff_user_id, doc_type) DO UPDATE SET
           file_path = EXCLUDED.file_path, status = 'PENDING',
           admin_remarks = NULL, uploaded_at = NOW()`,
        [tenantId, userId, docType, filePath],
      );
      if (docType === 'PHOTO') {
        await qr.query(
          `UPDATE users SET onboarding_profile = COALESCE(onboarding_profile, '{}'::jsonb)
              || jsonb_build_object('profile_photo_url', $3::text), updated_at = NOW()
           WHERE tenant_id = $1 AND user_id = $2`,
          [tenantId, userId, filePath],
        );
      }
      await qr.query(
        `UPDATE staff_profile_reviews SET revision = revision + 1, updated_at = NOW()
         WHERE review_id = $1`, [review.review_id],
      );
      await qr.commitTransaction();
      return { status: review.status, revision: review.revision + 1 };
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally { await qr.release(); }
  }

  async assertDocumentCorrectionAllowed(tenantId: string, userId: string, docType: string) {
    const review = await this.activeReview(tenantId, userId);
    if (!review || review.status !== 'RETURNED_FOR_CORRECTION' ||
        !review.requested_docs.includes(docType)) {
      throw new ForbiddenException('HR has not requested this document');
    }
  }

  async resubmit(tenantId: string, userId: string) {
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const review = await this.activeReview(tenantId, userId, qr, true);
      if (review?.recovery_required && review.status === 'PENDING_HR') {
        await qr.commitTransaction();
        return { status: 'PENDING_HR', replayed: true };
      }
      if (!review || review.status !== 'RETURNED_FOR_CORRECTION') {
        throw new ConflictException('No returned review to resubmit');
      }
      const snapshot = await this.snapshot(tenantId, userId, qr);
      const edits = await qr.query(
        `SELECT reason, event_type FROM staff_profile_review_events
         WHERE review_id = $1 AND tenant_id = $2
           AND event_type IN ('BEFORE_PROFILE_CORRECTION', 'BEFORE_DOCUMENT_CORRECTION')
           AND revision > COALESCE((
             SELECT MAX(revision) FROM staff_profile_review_events
             WHERE review_id = $1 AND event_type IN ('RETURNED', 'RECOVERY_OPENED')
           ), 0)`,
        [review.review_id, tenantId],
      );
      const corrected = new Set(edits.filter((event: { event_type: string }) => event.event_type === 'BEFORE_PROFILE_CORRECTION')
        .flatMap((event: { reason: string | null }) =>
        String(event.reason ?? '').split(',').filter(Boolean)));
      const correctedDocuments = new Set(edits.filter((event: { event_type: string }) =>
        event.event_type === 'BEFORE_DOCUMENT_CORRECTION').map((event: { reason: string | null }) => event.reason));
      const missingFields = review.requested_fields.filter((field) => !corrected.has(field));
      if (missingFields.length) throw new BadRequestException(`Correct requested fields: ${missingFields.join(', ')}`);
      for (const doc of review.requested_docs) {
        const current = snapshot.documentManifest.find((item: { doc_type: string; status: string }) => item.doc_type === doc);
        if (!current || current.status !== 'PENDING' || !correctedDocuments.has(doc)) {
          throw new BadRequestException(`Upload a replacement for ${doc}`);
        }
      }
      const recoveryEvidence = review.recovery_required
        ? await this.inspectRecoveryDocuments(tenantId, snapshot.profile, snapshot.user.phone, snapshot.documentManifest)
        : null;
      if (review.recovery_required && snapshot.user.onboarding_status === 'PENDING_DOCUMENTS') {
        // Forward progress only for never-approved staff; previously completed
        // onboarding and all old decisions remain unchanged.
        await qr.query(`UPDATE users SET onboarding_status = 'PENDING_ADMIN_APPROVAL', updated_at = NOW()
          WHERE tenant_id = $1 AND user_id = $2 AND onboarding_status = 'PENDING_DOCUMENTS'`, [tenantId, userId]);
      }
      await qr.query(
        `UPDATE staff_profile_reviews
         SET status = 'PENDING_HR', requested_fields = '{}', requested_docs = '{}',
             return_reason = NULL, submitted_snapshot_hash = $3,
             revision = revision + 1, updated_at = NOW()
         WHERE tenant_id = $1 AND review_id = $2`,
        [tenantId, review.review_id, snapshot.hash],
      );
      await this.appendEvent(qr, { ...review, revision: review.revision + 1 }, 'RESUBMITTED', userId,
        recoveryEvidence ? JSON.stringify({ recovery: true, verified_storage_manifest: recoveryEvidence }) : undefined);
      await qr.commitTransaction();
      return { status: 'PENDING_HR' };
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally { await qr.release(); }
  }
}
