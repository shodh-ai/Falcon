import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DofaEngineService } from '../dofa-engine/dofa-engine.service';

@Injectable()
export class UosGovernanceService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly dofa: DofaEngineService,
  ) {}

  private tenant(id?: string) {
    return id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  // --- ALM ---

  listAmc(tenantId?: string) {
    return this.db.query(
      `SELECT c.*, a.name AS asset_name, a.asset_tag
       FROM asset_amc_contracts c
       JOIN university_assets a ON a.asset_id = c.asset_id
       WHERE c.tenant_id = $1 ORDER BY c.end_date DESC`,
      [this.tenant(tenantId)],
    );
  }

  async createAmc(
    tenantId: string | undefined,
    body: {
      asset_id: string;
      vendor_name: string;
      start_date: string;
      end_date: string;
      amount_inr: number;
      notes?: string;
    },
  ) {
    const rows = await this.db.query(
      `INSERT INTO asset_amc_contracts (
         tenant_id, asset_id, vendor_name, start_date, end_date, amount_inr, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        this.tenant(tenantId),
        body.asset_id,
        body.vendor_name,
        body.start_date,
        body.end_date,
        body.amount_inr,
        body.notes ?? null,
      ],
    );
    return rows[0];
  }

  listCalibrations(tenantId?: string) {
    return this.db.query(
      `SELECT c.*, a.name AS asset_name, a.asset_tag
       FROM asset_calibration_schedules c
       JOIN university_assets a ON a.asset_id = c.asset_id
       WHERE c.tenant_id = $1 ORDER BY c.next_due_at ASC`,
      [this.tenant(tenantId)],
    );
  }

  async scheduleCalibration(
    tenantId: string | undefined,
    body: { asset_id: string; next_due_at: string },
  ) {
    const rows = await this.db.query(
      `INSERT INTO asset_calibration_schedules (tenant_id, asset_id, next_due_at)
       VALUES ($1,$2,$3) RETURNING *`,
      [this.tenant(tenantId), body.asset_id, body.next_due_at],
    );
    return rows[0];
  }

  /** Due calibrations → ESM helpdesk tickets */
  async runCalibrationAlerts(tenantId?: string) {
    const tid = this.tenant(tenantId);
    const due = await this.db.query(
      `SELECT c.*, a.name AS asset_name, a.asset_tag
       FROM asset_calibration_schedules c
       JOIN university_assets a ON a.asset_id = c.asset_id
       WHERE c.tenant_id = $1 AND c.status = 'SCHEDULED'
         AND c.next_due_at <= CURRENT_DATE + 7
         AND c.esm_ticket_id IS NULL`,
      [tid],
    );
    const created: unknown[] = [];
    for (const row of due) {
      let ticketId: string | null = null;
      try {
        const t = await this.db.query(
          `INSERT INTO helpdesk_tickets (
             tenant_id, subject, description, category, status, priority
           ) VALUES ($1,$2,$3,'FACILITIES','OPEN','NORMAL')
           RETURNING ticket_id`,
          [
            tid,
            `Calibration due: ${row.asset_tag || row.asset_name}`,
            `Asset ${row.asset_name} (${row.asset_id}) calibration due ${row.next_due_at}`,
          ],
        );
        ticketId = t[0]?.ticket_id ?? null;
      } catch {
        // helpdesk schema may vary — still mark alerted via status
      }
      await this.db.query(
        `UPDATE asset_calibration_schedules
         SET esm_ticket_id = COALESCE($2, esm_ticket_id), status = 'ALERTED'
         WHERE calib_id = $1`,
        [row.calib_id, ticketId],
      );
      created.push({ calib_id: row.calib_id, esm_ticket_id: ticketId });
    }
    return { alerted: created.length, items: created };
  }

  listWriteoffs(tenantId?: string) {
    return this.db.query(
      `SELECT w.*, a.name AS asset_name, a.asset_tag, u.name AS requester_name
       FROM asset_writeoff_requests w
       JOIN university_assets a ON a.asset_id = w.asset_id
       LEFT JOIN users u ON u.user_id = w.requested_by
       WHERE w.tenant_id = $1 ORDER BY w.created_at DESC`,
      [this.tenant(tenantId)],
    );
  }

  async requestWriteoff(
    tenantId: string | undefined,
    userId: string,
    body: { asset_id: string; reason: string },
  ) {
    if (!body.reason?.trim()) throw new BadRequestException('reason required');
    const tid = this.tenant(tenantId);
    const rows = await this.db.query(
      `INSERT INTO asset_writeoff_requests (
         tenant_id, asset_id, requested_by, reason, status
       ) VALUES ($1,$2,$3,$4,'PENDING_DOFA') RETURNING *`,
      [tid, body.asset_id, userId, body.reason.trim()],
    );
    const row = rows[0];
    const asset = await this.db.query(
      `SELECT name, asset_tag FROM university_assets WHERE asset_id = $1`,
      [body.asset_id],
    );
    const dofa = await this.dofa.openCase(tid, {
      domain: 'ASSET_WRITEOFF',
      title: `Write-off ${asset[0]?.asset_tag || body.asset_id}: ${body.reason.trim().slice(0, 80)}`,
      requester_id: userId,
      source_table: 'asset_writeoff_requests',
      source_id: row.writeoff_id,
      payload: { asset_id: body.asset_id, asset_name: asset[0]?.name },
      rule_key: 'HEAVY',
    });
    return { ...row, dofa_case_id: dofa.case_id, dofa };
  }

  async advanceWriteoff(
    tenantId: string | undefined,
    userId: string,
    roleName: string,
    writeoffId: string,
    decision: 'APPROVED' | 'REJECTED' = 'APPROVED',
  ) {
    const tid = this.tenant(tenantId);
    const cases = await this.db.query(
      `SELECT case_id FROM dofa_cases
       WHERE tenant_id = $1 AND domain = 'ASSET_WRITEOFF' AND source_id = $2
         AND status IN ('PENDING','ESCALATED')
       ORDER BY created_at DESC LIMIT 1`,
      [tid, writeoffId],
    );
    if (!cases[0]) {
      throw new BadRequestException({
        message: 'No open DOFA case for this write-off — use /api/dofa/inbox',
        code: 'DOFA_CASE_MISSING',
      });
    }
    const decided = await this.dofa.decide(tid, userId, roleName, cases[0].case_id, {
      decision,
    });
    const out = await this.db.query(
      `SELECT * FROM asset_writeoff_requests WHERE writeoff_id = $1`,
      [writeoffId],
    );
    return { ...out[0], dofa: decided };
  }

  async upsertAssetFromGrn(
    tenantId: string,
    body: {
      asset_barcode: string;
      name: string;
      po_id?: string;
      vendor_id?: string;
      asset_value?: number;
    },
  ) {
    const existing = await this.db.query(
      `SELECT * FROM university_assets WHERE tenant_id = $1 AND asset_tag = $2 LIMIT 1`,
      [tenantId, body.asset_barcode],
    );
    if (existing[0]) return existing[0];
    const rows = await this.db.query(
      `INSERT INTO university_assets (
         tenant_id, asset_tag, asset_type, name, status, po_id, vendor_id,
         asset_value, book_value, purchase_date
       ) VALUES ($1,$2,'EQUIPMENT',$3,'AVAILABLE',$4,$5,$6,$6,CURRENT_DATE)
       RETURNING *`,
      [
        tenantId,
        body.asset_barcode,
        body.name,
        body.po_id ?? null,
        body.vendor_id ?? null,
        body.asset_value ?? null,
      ],
    );
    return rows[0];
  }

  // --- SIS ---

  listGradeChanges(tenantId?: string) {
    return this.db.query(
      `SELECT g.*, s.name AS student_name, r.name AS requester_name
       FROM sis_grade_change_requests g
       LEFT JOIN users s ON s.user_id = g.student_user_id
       LEFT JOIN users r ON r.user_id = g.requested_by
       WHERE g.tenant_id = $1 ORDER BY g.created_at DESC`,
      [this.tenant(tenantId)],
    );
  }

  async createGradeChange(
    tenantId: string | undefined,
    userId: string,
    body: {
      student_user_id: string;
      course_code: string;
      course_name?: string;
      from_grade: string;
      to_grade: string;
      reason: string;
    },
  ) {
    if (body.student_user_id === userId) {
      throw new BadRequestException({
        message: 'Cannot request grade change for self as student identity collision',
        code: 'SOD_VIOLATION',
      });
    }
    const tid = this.tenant(tenantId);
    const rows = await this.db.query(
      `INSERT INTO sis_grade_change_requests (
         tenant_id, student_user_id, course_code, course_name,
         from_grade, to_grade, reason, requested_by, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDING_DOFA') RETURNING *`,
      [
        tid,
        body.student_user_id,
        body.course_code,
        body.course_name ?? null,
        body.from_grade,
        body.to_grade,
        body.reason,
        userId,
      ],
    );
    const row = rows[0];
    const dofa = await this.dofa.openCase(tid, {
      domain: 'GRADE_CHANGE',
      title: `Grade ${body.course_code}: ${body.from_grade}→${body.to_grade}`,
      requester_id: userId,
      source_table: 'sis_grade_change_requests',
      source_id: row.change_id,
      payload: {
        student_user_id: body.student_user_id,
        from_grade: body.from_grade,
        to_grade: body.to_grade,
      },
      rule_key: 'DEFAULT',
    });
    return { ...row, dofa_case_id: dofa.case_id, dofa };
  }

  async advanceGradeChange(
    tenantId: string | undefined,
    userId: string,
    roleName: string,
    changeId: string,
  ) {
    const tid = this.tenant(tenantId);
    const cases = await this.db.query(
      `SELECT case_id FROM dofa_cases
       WHERE tenant_id = $1 AND domain = 'GRADE_CHANGE' AND source_id = $2
         AND status IN ('PENDING','ESCALATED')
       ORDER BY created_at DESC LIMIT 1`,
      [tid, changeId],
    );
    if (!cases[0]) {
      throw new BadRequestException({
        message: 'No open DOFA case — approve via /api/dofa/inbox',
        code: 'DOFA_CASE_MISSING',
      });
    }
    const decided = await this.dofa.decide(tid, userId, roleName, cases[0].case_id, {
      decision: 'APPROVED',
    });
    if (decided.status === 'APPROVED') {
      await this.recordEvidence(tid, 'SIS', changeId, 'Grade change applied via DOFA', {});
    }
    const out = await this.db.query(
      `SELECT * FROM sis_grade_change_requests WHERE change_id = $1`,
      [changeId],
    );
    return { ...out[0], dofa: decided };
  }

  listCurriculum(tenantId?: string) {
    return this.db.query(
      `SELECT * FROM sis_curriculum_proposals WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [this.tenant(tenantId)],
    );
  }

  async createCurriculum(
    tenantId: string | undefined,
    userId: string,
    body: {
      title: string;
      syllabus_pdf_path: string;
      program_code?: string;
      course_code?: string;
      effective_term?: string;
    },
  ) {
    const rows = await this.db.query(
      `INSERT INTO sis_curriculum_proposals (
         tenant_id, title, program_code, course_code, syllabus_pdf_path,
         effective_term, created_by, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING_BOS') RETURNING *`,
      [
        this.tenant(tenantId),
        body.title,
        body.program_code ?? null,
        body.course_code ?? null,
        body.syllabus_pdf_path,
        body.effective_term ?? null,
        userId,
      ],
    );
    return rows[0];
  }

  async signCurriculumBos(
    tenantId: string | undefined,
    userId: string,
    roleName: string,
    proposalId: string,
  ) {
    const tid = this.tenant(tenantId);
    const rows = await this.db.query(
      `SELECT * FROM sis_curriculum_proposals WHERE proposal_id = $1 AND tenant_id = $2`,
      [proposalId, tid],
    );
    const p = rows[0];
    if (!p) throw new NotFoundException('Curriculum proposal not found');
    if (p.status !== 'PENDING_BOS') {
      throw new BadRequestException('Not awaiting BoS signatures');
    }
    const sigs = Array.isArray(p.bos_signatures) ? p.bos_signatures : [];
    if (sigs.some((s: { user_id: string }) => s.user_id === userId)) {
      throw new BadRequestException('Already signed');
    }
    sigs.push({ user_id: userId, role: roleName, at: new Date().toISOString() });
    const nextStatus = sigs.length >= 2 ? 'PENDING_DEAN' : 'PENDING_BOS';
    const out = await this.db.query(
      `UPDATE sis_curriculum_proposals
       SET bos_signatures = $2::jsonb, status = $3, updated_at = NOW()
       WHERE proposal_id = $1 RETURNING *`,
      [proposalId, JSON.stringify(sigs), nextStatus],
    );
    return out[0];
  }

  async finalizeCurriculum(
    tenantId: string | undefined,
    userId: string,
    proposalId: string,
  ) {
    const out = await this.db.query(
      `UPDATE sis_curriculum_proposals
       SET status = 'APPROVED', dean_by = $2, dean_at = NOW(), updated_at = NOW()
       WHERE proposal_id = $1 AND tenant_id = $3 AND status = 'PENDING_DEAN'
       RETURNING *`,
      [proposalId, userId, this.tenant(tenantId)],
    );
    if (!out[0]) throw new BadRequestException('Not ready for Dean finalize');
    await this.recordEvidence(
      this.tenant(tenantId),
      'SIS',
      proposalId,
      'Curriculum BoS approved',
      { title: out[0].title },
    );
    return out[0];
  }

  // --- Legal MOU ---

  listMous(tenantId?: string) {
    return this.db.query(
      `SELECT * FROM legal_mou_approvals WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [this.tenant(tenantId)],
    );
  }

  async submitMou(
    tenantId: string | undefined,
    userId: string,
    body: { title: string; counterparty?: string; pdf_path?: string },
  ) {
    const rows = await this.db.query(
      `INSERT INTO legal_mou_approvals (
         tenant_id, title, counterparty, pdf_path, submitted_by, status
       ) VALUES ($1,$2,$3,$4,$5,'PENDING_LEGAL') RETURNING *`,
      [
        this.tenant(tenantId),
        body.title,
        body.counterparty ?? null,
        body.pdf_path ?? null,
        userId,
      ],
    );
    return rows[0];
  }

  async advanceMou(
    tenantId: string | undefined,
    userId: string,
    roleName: string,
    mouId: string,
  ) {
    const tid = this.tenant(tenantId);
    const rows = await this.db.query(
      `SELECT * FROM legal_mou_approvals WHERE mou_approval_id = $1 AND tenant_id = $2`,
      [mouId, tid],
    );
    const m = rows[0];
    if (!m) throw new NotFoundException('MOU not found');
    const role = roleName.toLowerCase();
    if (
      m.status === 'PENDING_LEGAL' &&
      ['legalofficer', 'superadmin'].includes(role)
    ) {
      await this.db.query(
        `UPDATE legal_mou_approvals
         SET status = 'PENDING_DEAN', legal_by = $2, legal_at = NOW(), updated_at = NOW()
         WHERE mou_approval_id = $1`,
        [mouId, userId],
      );
    } else if (
      m.status === 'PENDING_DEAN' &&
      ['dean', 'superadmin'].includes(role)
    ) {
      await this.db.query(
        `UPDATE legal_mou_approvals
         SET status = 'PENDING_VC', dean_by = $2, dean_at = NOW(), updated_at = NOW()
         WHERE mou_approval_id = $1`,
        [mouId, userId],
      );
    } else if (
      m.status === 'PENDING_VC' &&
      ['president', 'chairman', 'superadmin'].includes(role)
    ) {
      await this.db.query(
        `UPDATE legal_mou_approvals
         SET status = 'AUTO_SIGNED', vc_by = $2, vc_at = NOW(), signed_at = NOW(), updated_at = NOW()
         WHERE mou_approval_id = $1`,
        [mouId, userId],
      );
      await this.recordEvidence(tid, 'LEGAL', mouId, `MOU signed: ${m.title}`, {
        counterparty: m.counterparty,
      });
    } else {
      throw new BadRequestException({
        message: `Role ${roleName} cannot advance ${m.status}`,
        code: 'MOU_WRONG_STEP',
      });
    }
    const out = await this.db.query(
      `SELECT * FROM legal_mou_approvals WHERE mou_approval_id = $1`,
      [mouId],
    );
    return out[0];
  }

  listEvidence(tenantId?: string) {
    return this.db.query(
      `SELECT * FROM accreditation_evidence_events
       WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [this.tenant(tenantId)],
    );
  }

  async recordEvidence(
    tenantId: string,
    sourceSystem: string,
    sourceId: string,
    title: string,
    payload: Record<string, unknown>,
  ) {
    await this.db.query(
      `INSERT INTO accreditation_evidence_events (
         tenant_id, source_system, source_id, title, payload, criteria_hint
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
      [
        tenantId,
        sourceSystem,
        sourceId,
        title,
        JSON.stringify(payload),
        sourceSystem,
      ],
    );
  }

  // --- Space DOFA ---

  listSpaceBookings(tenantId?: string) {
    return this.db.query(
      `SELECT b.*, v.name AS venue_name
       FROM venue_bookings b
       LEFT JOIN campus_venues v ON v.venue_id = b.venue_id
       WHERE b.tenant_id = $1
       ORDER BY b.start_time DESC
       LIMIT 100`,
      [this.tenant(tenantId)],
    );
  }

  async advanceSpaceDofa(
    tenantId: string | undefined,
    userId: string,
    roleName: string,
    bookingId: string,
  ) {
    const tid = this.tenant(tenantId);
    const rows = await this.db.query(
      `SELECT * FROM venue_bookings WHERE booking_id = $1 AND tenant_id = $2`,
      [bookingId, tid],
    );
    const b = rows[0];
    if (!b) throw new NotFoundException('Booking not found');
    const role = roleName.toLowerCase();
    const status = b.dofa_status || 'PENDING_MENTOR';

    if (
      status === 'PENDING_MENTOR' &&
      ['faculty', 'hod', 'superadmin'].includes(role)
    ) {
      await this.db.query(
        `UPDATE venue_bookings
         SET dofa_status = 'PENDING_ESTATE', mentor_by = $2, mentor_at = NOW(), updated_at = NOW()
         WHERE booking_id = $1`,
        [bookingId, userId],
      );
    } else if (
      status === 'PENDING_ESTATE' &&
      ['estateofficer', 'coo', 'superadmin'].includes(role)
    ) {
      await this.db.query(
        `UPDATE venue_bookings
         SET dofa_status = 'PENDING_SECURITY', estate_by = $2, estate_at = NOW(), updated_at = NOW()
         WHERE booking_id = $1`,
        [bookingId, userId],
      );
    } else if (
      status === 'PENDING_SECURITY' &&
      ['security', 'coo', 'superadmin', 'campusadmin'].includes(role)
    ) {
      // conflict vs timetable rooms (best-effort)
      try {
        const conflicts = await this.db.query(
          `SELECT 1 FROM timetable_room_allocations t
           JOIN campus_venues v ON lower(v.name) = lower(COALESCE(t.room_name, t.space_name, ''))
           WHERE v.venue_id = $1
             AND t.start_time < $3 AND t.end_time > $2
           LIMIT 1`,
          [b.venue_id, b.start_time, b.end_time],
        );
        if (conflicts[0]) {
          throw new BadRequestException({
            message: 'Conflicts with academic timetable allocation',
            code: 'SPACE_TIMETABLE_CONFLICT',
          });
        }
      } catch (e) {
        if (e instanceof BadRequestException) throw e;
      }
      await this.db.query(
        `UPDATE venue_bookings
         SET dofa_status = 'CONFIRMED', status = 'APPROVED',
             security_by = $2, security_at = NOW(), updated_at = NOW()
         WHERE booking_id = $1`,
        [bookingId, userId],
      );
    } else {
      throw new BadRequestException({
        message: `Role ${roleName} cannot advance space DOFA ${status}`,
        code: 'SPACE_WRONG_STEP',
      });
    }
    const out = await this.db.query(
      `SELECT * FROM venue_bookings WHERE booking_id = $1`,
      [bookingId],
    );
    return out[0];
  }
}
