import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomInt } from 'crypto';
import { DataSource } from 'typeorm';
import {
  POLICY_AUDIT_ACTION,
  POLICY_PROPOSE_ROLES,
  POLICY_STATUS,
  POLICY_UNLOCK_ROLES,
} from './dofa-policy.constants';

const OTP_TTL_MINUTES = 10;
const DEFAULT_TENANT = 'a0000000-0000-4000-8000-000000000001';

export type PolicyDomain =
  | 'P2P'
  | 'HR_HIRE'
  | 'GRADE_CHANGE'
  | 'ASSET_WRITEOFF'
  | 'MOU'
  | 'SPACE'
  | 'ESM_EXCEPTION';

type GraphJson = {
  nodes?: Array<{
    id: string;
    type?: string;
    position?: { x: number; y: number };
    data?: Record<string, unknown>;
  }>;
  edges?: Array<{ id?: string; source: string; target: string }>;
};

type CompiledBand = {
  level_no?: number;
  label?: string;
  rule_key?: string;
  amount_min?: number | null;
  amount_max?: number | null;
  max_amount_inr?: number | null;
  required_roles: string[];
  required_signatures: number;
  exception_escalate_role?: string;
};

@Injectable()
export class DofaPolicyService {
  private readonly logger = new Logger(DofaPolicyService.name);

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  private tenant(tenantId?: string) {
    return tenantId ?? DEFAULT_TENANT;
  }

  /** TypeORM pg sometimes returns rows[], sometimes [rows[], rowCount]. */
  private firstRow<T = Record<string, unknown>>(result: unknown): T {
    if (!Array.isArray(result)) return result as T;
    const head = result[0];
    if (Array.isArray(head)) return head[0] as T;
    return head as T;
  }

  private otpHash(otp: string) {
    return createHash('sha256').update(otp).digest('hex');
  }

  private roleOk(userRole: string, allowed: readonly string[]) {
    const r = userRole.toLowerCase();
    return allowed.some((a) => a.toLowerCase() === r);
  }

  /** Compile React Flow band nodes into matrix rows. */
  compileGraph(domain: string, graph: GraphJson | string): CompiledBand[] {
    const parsed: GraphJson =
      typeof graph === 'string' ? (JSON.parse(graph) as GraphJson) : graph ?? {};
    const bands = (parsed.nodes ?? [])
      .filter((n) => (n.type ?? 'band') === 'band' || n.type === 'condition')
      .map((n, idx) => {
        const d = n.data ?? {};
        let roles = d.required_roles as string[] | string | undefined;
        if (typeof roles === 'string') {
          try {
            roles = JSON.parse(roles) as string[];
          } catch {
            roles = String(roles)
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
          }
        }
        if (!Array.isArray(roles)) roles = [];
        if (!roles.length) {
          throw new BadRequestException({
            message: `Band ${n.id} needs required_roles`,
            code: 'POLICY_INVALID_GRAPH',
          });
        }
        const sigs = Number(d.required_signatures ?? roles.length) || 1;
        if (domain === 'P2P') {
          const rawMax =
            d.amount_max !== undefined && d.amount_max !== null
              ? d.amount_max
              : d.max_amount_inr;
          return {
            level_no: Number(d.level_no ?? idx + 1),
            label: String(d.label ?? `Level ${idx + 1}`),
            max_amount_inr:
              rawMax === undefined || rawMax === null ? null : Number(rawMax),
            required_roles: roles,
            required_signatures: sigs,
          } as CompiledBand;
        }
        return {
          rule_key: String(d.rule_key ?? `BAND_${idx + 1}`),
          amount_min:
            d.amount_min === undefined || d.amount_min === null
              ? null
              : Number(d.amount_min),
          amount_max:
            d.amount_max === undefined || d.amount_max === null
              ? null
              : Number(d.amount_max),
          required_roles: roles,
          required_signatures: sigs,
          exception_escalate_role: String(
            d.exception_escalate_role ?? 'Chairman',
          ),
        } as CompiledBand;
      });

    if (!bands.length) {
      throw new BadRequestException({
        message: 'Graph must contain at least one band node',
        code: 'POLICY_EMPTY_GRAPH',
      });
    }
    if (domain === 'P2P' && bands.length > 5) {
      throw new BadRequestException({
        message: 'P2P supports at most 5 levels',
        code: 'POLICY_P2P_LEVELS',
      });
    }
    return bands;
  }

  private async writeAudit(
    tenantId: string,
    graphId: string | null,
    action: string,
    actorUserId: string | null,
    actorRole: string | null,
    beforeJson: unknown,
    afterJson: unknown,
    minutesRef?: string | null,
  ) {
    await this.db.query(
      `INSERT INTO dofa_policy_audit
         (tenant_id, graph_id, action, actor_user_id, actor_role, before_json, after_json, minutes_ref)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)`,
      [
        tenantId,
        graphId,
        action,
        actorUserId,
        actorRole,
        JSON.stringify(beforeJson ?? null),
        JSON.stringify(afterJson ?? null),
        minutesRef ?? null,
      ],
    );
  }

  async listGraphs(tenantId?: string, domain?: string) {
    const tid = this.tenant(tenantId);
    if (domain) {
      return this.db.query(
        `SELECT graph_id, domain, title, version, status, minutes_ref,
                proposed_by, proposed_at, unlocked_by, unlocked_at, published_at, created_at, updated_at
         FROM dofa_policy_graphs
         WHERE tenant_id = $1 AND domain = $2
         ORDER BY version DESC, created_at DESC`,
        [tid, domain],
      );
    }
    return this.db.query(
      `SELECT graph_id, domain, title, version, status, minutes_ref,
              proposed_by, proposed_at, unlocked_by, unlocked_at, published_at, created_at, updated_at
       FROM dofa_policy_graphs
       WHERE tenant_id = $1
       ORDER BY domain, version DESC`,
      [tid],
    );
  }

  async getGraph(
    tenantId: string | undefined,
    graphId: string,
  ): Promise<Record<string, any>> {
    const rows = await this.db.query(
      `SELECT * FROM dofa_policy_graphs WHERE graph_id = $1 AND tenant_id = $2`,
      [graphId, this.tenant(tenantId)],
    );
    if (!rows[0] || (Array.isArray(rows[0]) && !rows[0][0])) {
      throw new NotFoundException('Policy graph not found');
    }
    return this.firstRow<Record<string, any>>(rows);
  }

  async createDraft(
    tenantId: string | undefined,
    userId: string,
    userRole: string,
    body: {
      domain: PolicyDomain;
      title: string;
      graph_json: GraphJson;
      compiled_matrix?: CompiledBand[];
      proposal_memo: string;
      minutes_ref: string;
    },
  ) {
    if (!this.roleOk(userRole, POLICY_PROPOSE_ROLES)) {
      throw new ForbiddenException({
        message: 'Only IT Head / CampusAdmin / SuperAdmin may draft policy',
        code: 'POLICY_PROPOSE_FORBIDDEN',
      });
    }
    if (!body.proposal_memo?.trim() || !body.minutes_ref?.trim()) {
      throw new BadRequestException({
        message: 'proposal_memo and minutes_ref are required',
        code: 'POLICY_GOVERNANCE_REQUIRED',
      });
    }

    const tid = this.tenant(tenantId);
    const compiled =
      body.compiled_matrix?.length
        ? body.compiled_matrix
        : this.compileGraph(body.domain, body.graph_json ?? { nodes: [] });

    const verRows = await this.db.query(
      `SELECT COALESCE(MAX(version), 0) + 1 AS next_v
       FROM dofa_policy_graphs WHERE tenant_id = $1 AND domain = $2`,
      [tid, body.domain],
    );
    const version = Number(verRows[0]?.next_v ?? 1);

    const rows = await this.db.query(
      `INSERT INTO dofa_policy_graphs (
         tenant_id, domain, title, version, status, graph_json, compiled_matrix,
         minutes_ref, proposal_memo, proposed_by, proposed_at
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,NOW())
       RETURNING *`,
      [
        tid,
        body.domain,
        body.title || `${body.domain} policy v${version}`,
        version,
        POLICY_STATUS.DRAFT,
        JSON.stringify(body.graph_json ?? { nodes: [], edges: [] }),
        JSON.stringify(compiled),
        body.minutes_ref.trim(),
        body.proposal_memo.trim(),
        userId,
      ],
    );
    const graph = this.firstRow<Record<string, unknown>>(rows);
    await this.writeAudit(
      tid,
      String(graph.graph_id),
      POLICY_AUDIT_ACTION.PROPOSE,
      userId,
      userRole,
      null,
      {
        status: POLICY_STATUS.DRAFT,
        domain: body.domain,
        version,
        compiled,
      },
      body.minutes_ref,
    );
    return graph;
  }

  async updateDraft(
    tenantId: string | undefined,
    userId: string,
    userRole: string,
    graphId: string,
    body: {
      title?: string;
      graph_json?: GraphJson;
      compiled_matrix?: CompiledBand[];
      proposal_memo?: string;
      minutes_ref?: string;
    },
  ) {
    if (!this.roleOk(userRole, POLICY_PROPOSE_ROLES)) {
      throw new ForbiddenException({
        message: 'Only IT Head may edit drafts',
        code: 'POLICY_PROPOSE_FORBIDDEN',
      });
    }
    const tid = this.tenant(tenantId);
    const g = await this.getGraph(tid, graphId);
    if (g.status !== POLICY_STATUS.DRAFT) {
      throw new BadRequestException({
        message: `Graph is ${g.status} — frozen`,
        code: 'POLICY_FROZEN',
      });
    }
    if (String(g.proposed_by) !== userId && !this.roleOk(userRole, ['SuperAdmin'])) {
      throw new ForbiddenException({
        message: 'Only the proposer (or SuperAdmin) may edit this draft',
        code: 'POLICY_NOT_OWNER',
      });
    }

    const graphJson = (body.graph_json ?? g.graph_json) as GraphJson;
    const compiled =
      body.compiled_matrix?.length
        ? body.compiled_matrix
        : this.compileGraph(String(g.domain), graphJson);

    const rows = await this.db.query(
      `UPDATE dofa_policy_graphs SET
         title = COALESCE($3, title),
         graph_json = $4::jsonb,
         compiled_matrix = $5::jsonb,
         proposal_memo = COALESCE($6, proposal_memo),
         minutes_ref = COALESCE($7, minutes_ref),
         updated_at = NOW()
       WHERE graph_id = $1 AND tenant_id = $2
       RETURNING *`,
      [
        graphId,
        tid,
        body.title ?? null,
        JSON.stringify(graphJson),
        JSON.stringify(compiled),
        body.proposal_memo ?? null,
        body.minutes_ref ?? null,
      ],
    );
    return this.firstRow(rows);
  }

  async submit(
    tenantId: string | undefined,
    userId: string,
    userRole: string,
    graphId: string,
  ) {
    if (!this.roleOk(userRole, POLICY_PROPOSE_ROLES)) {
      throw new ForbiddenException({ code: 'POLICY_PROPOSE_FORBIDDEN' });
    }
    const tid = this.tenant(tenantId);
    const g = await this.getGraph(tid, graphId);
    if (g.status !== POLICY_STATUS.DRAFT) {
      throw new BadRequestException({
        message: `Cannot submit status ${g.status}`,
        code: 'POLICY_BAD_STATUS',
      });
    }
    // Validate compile
    this.compileGraph(String(g.domain), g.graph_json as GraphJson);

    const rows = await this.db.query(
      `UPDATE dofa_policy_graphs
       SET status = $3, updated_at = NOW()
       WHERE graph_id = $1 AND tenant_id = $2
       RETURNING *`,
      [graphId, tid, POLICY_STATUS.PENDING_CFO],
    );
    await this.writeAudit(
      tid,
      graphId,
      POLICY_AUDIT_ACTION.SUBMIT,
      userId,
      userRole,
      { status: POLICY_STATUS.DRAFT },
      { status: POLICY_STATUS.PENDING_CFO },
      g.minutes_ref,
    );
    return this.firstRow(rows);
  }

  async requestOtp(
    tenantId: string | undefined,
    userId: string,
    userRole: string,
    graphId: string,
  ) {
    if (!this.roleOk(userRole, POLICY_UNLOCK_ROLES)) {
      throw new ForbiddenException({
        message: 'Only CFO may request unlock OTP',
        code: 'POLICY_UNLOCK_FORBIDDEN',
      });
    }
    const tid = this.tenant(tenantId);
    const g = await this.getGraph(tid, graphId);
    if (g.status !== POLICY_STATUS.PENDING_CFO) {
      throw new BadRequestException({
        message: 'Graph is not awaiting CFO unlock',
        code: 'POLICY_BAD_STATUS',
      });
    }
    if (String(g.proposed_by) === userId) {
      throw new ForbiddenException({
        message: 'SoD: proposer cannot unlock own change',
        code: 'SOD_VIOLATION',
      });
    }

    const otp = String(randomInt(0, 1000000)).padStart(6, '0');
    const expiresAt = new Date(
      Date.now() + OTP_TTL_MINUTES * 60 * 1000,
    ).toISOString();
    await this.db.query(
      `INSERT INTO dofa_policy_otps (tenant_id, graph_id, otp_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [tid, graphId, this.otpHash(otp), expiresAt],
    );
    this.logger.warn(`DEV OTP for policy graph ${graphId}: ${otp}`);
    return {
      graph_id: graphId,
      expires_at: expiresAt,
      dev_mode: true,
      dev_otp: otp,
    };
  }

  async unlockAndPublish(
    tenantId: string | undefined,
    userId: string,
    userRole: string,
    graphId: string,
    otp: string,
  ) {
    if (!this.roleOk(userRole, POLICY_UNLOCK_ROLES)) {
      throw new ForbiddenException({
        message: 'Only CFO may unlock',
        code: 'POLICY_UNLOCK_FORBIDDEN',
      });
    }
    const tid = this.tenant(tenantId);

    return this.db.transaction(async (tx) => {
      const rows = await tx.query(
        `SELECT * FROM dofa_policy_graphs
         WHERE graph_id = $1 AND tenant_id = $2 FOR UPDATE`,
        [graphId, tid],
      );
      const g = this.firstRow<Record<string, any>>(rows);
      if (!g?.graph_id) throw new NotFoundException('Policy graph not found');
      if (g.status !== POLICY_STATUS.PENDING_CFO) {
        throw new BadRequestException({
          message: `Cannot unlock status ${g.status}`,
          code: 'POLICY_BAD_STATUS',
        });
      }
      if (String(g.proposed_by) === userId) {
        throw new ForbiddenException({
          message: 'SoD: proposer cannot unlock own change',
          code: 'SOD_VIOLATION',
        });
      }

      const otpRows = await tx.query(
        `SELECT otp_id, otp_hash, expires_at, used_at
         FROM dofa_policy_otps
         WHERE tenant_id = $1 AND graph_id = $2
         ORDER BY created_at DESC LIMIT 1
         FOR UPDATE`,
        [tid, graphId],
      );
      const otpRow = this.firstRow<{
        otp_id: string;
        otp_hash: string;
        expires_at: string;
        used_at: string | null;
      }>(otpRows);
      if (!otpRow) throw new BadRequestException('OTP not requested');
      if (otpRow.used_at) throw new BadRequestException('OTP already used');
      if (new Date(otpRow.expires_at).getTime() < Date.now()) {
        throw new BadRequestException('OTP expired');
      }
      if (otpRow.otp_hash !== this.otpHash(otp)) {
        throw new BadRequestException('Invalid OTP');
      }

      await tx.query(
        `UPDATE dofa_policy_otps SET used_at = NOW() WHERE otp_id = $1`,
        [otpRow.otp_id],
      );

      const beforeLive = await this.snapshotLive(tx, tid, String(g.domain));

      await tx.query(
        `UPDATE dofa_policy_graphs
         SET status = $3, updated_at = NOW()
         WHERE tenant_id = $1 AND domain = $2 AND status = $4 AND graph_id <> $5`,
        [
          tid,
          g.domain,
          POLICY_STATUS.SUPERSEDED,
          POLICY_STATUS.PUBLISHED,
          graphId,
        ],
      );

      await this.applyCompiled(tx, tid, String(g.domain), g.compiled_matrix);

      const published = await tx.query(
        `UPDATE dofa_policy_graphs SET
           status = $3,
           unlocked_by = $4,
           unlocked_at = NOW(),
           published_at = NOW(),
           updated_at = NOW()
         WHERE graph_id = $1 AND tenant_id = $2
         RETURNING *`,
        [graphId, tid, POLICY_STATUS.PUBLISHED, userId],
      );

      await tx.query(
        `INSERT INTO dofa_policy_audit
           (tenant_id, graph_id, action, actor_user_id, actor_role, before_json, after_json, minutes_ref)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)`,
        [
          tid,
          graphId,
          POLICY_AUDIT_ACTION.UNLOCK,
          userId,
          userRole,
          JSON.stringify({ status: POLICY_STATUS.PENDING_CFO }),
          JSON.stringify({ status: 'UNLOCKED' }),
          g.minutes_ref,
        ],
      );
      await tx.query(
        `INSERT INTO dofa_policy_audit
           (tenant_id, graph_id, action, actor_user_id, actor_role, before_json, after_json, minutes_ref)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)`,
        [
          tid,
          graphId,
          POLICY_AUDIT_ACTION.PUBLISH,
          userId,
          userRole,
          JSON.stringify(beforeLive),
          JSON.stringify({
            status: POLICY_STATUS.PUBLISHED,
            compiled: g.compiled_matrix,
            domain: g.domain,
            version: g.version,
          }),
          g.minutes_ref,
        ],
      );

      return this.firstRow(published);
    });
  }

  private async snapshotLive(
    tx: DataSource | { query: DataSource['query'] },
    tenantId: string,
    domain: string,
  ) {
    if (domain === 'P2P') {
      return tx.query(
        `SELECT level_no, label, max_amount_inr, required_roles, required_signatures
         FROM fin_dofa_levels WHERE tenant_id = $1 ORDER BY level_no`,
        [tenantId],
      );
    }
    return tx.query(
      `SELECT rule_key, amount_min, amount_max, required_roles, required_signatures, exception_escalate_role
       FROM dofa_matrices WHERE tenant_id = $1 AND domain = $2 AND is_active
       ORDER BY amount_min NULLS FIRST`,
      [tenantId, domain],
    );
  }

  private async applyCompiled(
    tx: { query: DataSource['query'] },
    tenantId: string,
    domain: string,
    compiledRaw: unknown,
  ) {
    const compiled = (
      typeof compiledRaw === 'string' ? JSON.parse(compiledRaw) : compiledRaw
    ) as CompiledBand[];

    if (domain === 'P2P') {
      for (const band of compiled) {
        const levelNo = Number(band.level_no);
        if (!levelNo || levelNo < 1 || levelNo > 5) {
          throw new BadRequestException(`Invalid P2P level_no ${band.level_no}`);
        }
        const roles = band.required_roles;
        await tx.query(
          `INSERT INTO fin_dofa_levels
             (tenant_id, level_no, label, max_amount_inr, required_roles, required_signatures)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (tenant_id, level_no) DO UPDATE SET
             label = EXCLUDED.label,
             max_amount_inr = EXCLUDED.max_amount_inr,
             required_roles = EXCLUDED.required_roles,
             required_signatures = EXCLUDED.required_signatures`,
          [
            tenantId,
            levelNo,
            band.label ?? `Level ${levelNo}`,
            band.max_amount_inr ?? null,
            roles,
            band.required_signatures ?? 1,
          ],
        );
        // Sync fin_dofa_rules for primary role at this level (best-effort)
        const primary = roles[0];
        if (primary && band.max_amount_inr != null) {
          await tx.query(
            `INSERT INTO fin_dofa_rules (tenant_id, role_name, max_amount_inr)
             VALUES ($1, $2, $3)
             ON CONFLICT (tenant_id, role_name) DO UPDATE SET
               max_amount_inr = EXCLUDED.max_amount_inr`,
            [tenantId, primary, band.max_amount_inr],
          );
        }
      }
      return;
    }

    await tx.query(
      `UPDATE dofa_matrices SET is_active = false
       WHERE tenant_id = $1 AND domain = $2`,
      [tenantId, domain],
    );
    for (const band of compiled) {
      await tx.query(
        `INSERT INTO dofa_matrices (
           tenant_id, domain, rule_key, amount_min, amount_max,
           required_roles, required_signatures, exception_escalate_role, is_active
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)`,
        [
          tenantId,
          domain,
          band.rule_key ?? 'DEFAULT',
          band.amount_min ?? null,
          band.amount_max ?? null,
          band.required_roles,
          band.required_signatures ?? band.required_roles.length,
          band.exception_escalate_role ?? 'Chairman',
        ],
      );
    }
  }

  async reject(
    tenantId: string | undefined,
    userId: string,
    userRole: string,
    graphId: string,
    notes?: string,
  ) {
    const allowed = ['CFO', 'Chairman', 'President', 'SuperAdmin'];
    if (!this.roleOk(userRole, allowed)) {
      throw new ForbiddenException({ code: 'POLICY_REJECT_FORBIDDEN' });
    }
    const tid = this.tenant(tenantId);
    const g = await this.getGraph(tid, graphId);
    if (
      ![POLICY_STATUS.DRAFT, POLICY_STATUS.PENDING_CFO].includes(
        g.status as typeof POLICY_STATUS.DRAFT,
      )
    ) {
      throw new BadRequestException({ code: 'POLICY_BAD_STATUS' });
    }
    const rows = await this.db.query(
      `UPDATE dofa_policy_graphs SET status = $3, updated_at = NOW()
       WHERE graph_id = $1 AND tenant_id = $2 RETURNING *`,
      [graphId, tid, POLICY_STATUS.REJECTED],
    );
    await this.writeAudit(
      tid,
      graphId,
      POLICY_AUDIT_ACTION.REJECT,
      userId,
      userRole,
      { status: g.status },
      { status: POLICY_STATUS.REJECTED, notes: notes ?? null },
      g.minutes_ref,
    );
    return this.firstRow(rows);
  }

  async listAudit(tenantId?: string, graphId?: string) {
    const tid = this.tenant(tenantId);
    if (graphId) {
      return this.db.query(
        `SELECT a.*, u.official_email AS actor_email
         FROM dofa_policy_audit a
         LEFT JOIN users u ON u.user_id = a.actor_user_id
         WHERE a.tenant_id = $1 AND a.graph_id = $2
         ORDER BY a.created_at DESC
         LIMIT 200`,
        [tid, graphId],
      );
    }
    return this.db.query(
      `SELECT a.*, u.official_email AS actor_email
       FROM dofa_policy_audit a
       LEFT JOIN users u ON u.user_id = a.actor_user_id
       WHERE a.tenant_id = $1
       ORDER BY a.created_at DESC
       LIMIT 200`,
      [tid],
    );
  }
}
