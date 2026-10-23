import 'reflect-metadata';
import { Injectable, ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PassportModule, PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import request from 'supertest';
import type { DataSource, EntityManager } from 'typeorm';
import { AcademicRndController } from './academic-rnd.controller';
import { AcademicRndService } from './academic-rnd.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

// Real Nest routing, DTO validation, JWT/role guards and grant business methods.
// Persistence is deliberately synthetic: no database, live login or outgoing notifications.
jest.mock('../../core/notifications/notification-emitter.service', () => ({ NotificationEmitterService: class {} }));
jest.mock('../integrations/notification.service', () => ({ NotificationService: class {} }));

const TEST_KEY = 'synthetic-guide-http-only-never-use-for-an-application-session';
const TENANT = 'd1000000-0000-4000-8000-000000000001';
const OTHER_TENANT = 'd1000000-0000-4000-8000-000000000002';
const FACULTY = 'd2000000-0000-4000-8000-000000000001';
const OTHER_FACULTY = 'd2000000-0000-4000-8000-000000000002';
const STUDENT = 'd3000000-0000-4000-8000-000000000001';
const OTHER_STUDENT = 'd3000000-0000-4000-8000-000000000002';
const APPLICATION = 'd4000000-0000-4000-8000-000000000001';
const COMMON_APPLICATION = 'd4000000-0000-4000-8000-000000000002';
type Principal = { user_id: string; tenant_id: string; role: string; roles: string[] };
type SyntheticUser = { user_id: string; tenant_id: string; is_active: boolean; deleted_at: string | null };
type SyntheticApplication = { application_id: string; tenant_id: string; student_user_id: string; guide_faculty_user_id: string | null; project_title: string; status: string };
type SyntheticApproval = { tenant_id: string; application_id: string; approver_user_id: string; approval_tier: string; status: string; remarks: string | null };

@Injectable()
class SyntheticJwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() { super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: TEST_KEY, ignoreExpiration: false }); }
  validate(payload: Principal) { return payload; }
}

class SyntheticGrantStore {
  users = new Map<string, SyntheticUser>([
    [FACULTY, { user_id: FACULTY, tenant_id: TENANT, is_active: true, deleted_at: null }],
    [OTHER_FACULTY, { user_id: OTHER_FACULTY, tenant_id: TENANT, is_active: true, deleted_at: null }],
    [STUDENT, { user_id: STUDENT, tenant_id: TENANT, is_active: true, deleted_at: null }],
    [OTHER_STUDENT, { user_id: OTHER_STUDENT, tenant_id: OTHER_TENANT, is_active: true, deleted_at: null }],
  ]);
  applications = new Map<string, SyntheticApplication>();
  approvals: SyntheticApproval[] = [];
  updateConflict = false;
  auditFailure = false;
  private transactionTail = Promise.resolve();

  constructor() {
    this.add(APPLICATION, FACULTY);
    this.add(COMMON_APPLICATION, null);
  }

  add(id: string, guide: string | null, changes: Partial<SyntheticApplication> = {}) {
    const row = { application_id: id, tenant_id: TENANT, student_user_id: STUDENT, guide_faculty_user_id: guide, project_title: `Synthetic study ${id.slice(-1)}`, status: 'PENDING_GUIDE', ...changes };
    this.applications.set(id, row);
    return row;
  }

  async transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    // Serialize fixture transactions to model the service's FOR UPDATE row lock.
    const preceding = this.transactionTail;
    let release!: () => void;
    this.transactionTail = new Promise<void>((done) => { release = done; });
    await preceding;
    const applicationsBefore = new Map(Array.from(this.applications, ([id, row]) => [id, { ...row }]));
    const approvalsBefore = [...this.approvals];
    try { return await work({ query: this.query.bind(this) } as unknown as EntityManager); }
    catch (error) { this.applications = applicationsBefore; this.approvals = approvalsBefore; throw error; }
    finally { release(); }
  }

  async query(sql: string, args: unknown[] = []): Promise<unknown> {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized.startsWith('SELECT tenant_id FROM users')) {
      const actor = this.users.get(String(args[0]));
      return actor?.is_active && !actor.deleted_at ? [{ tenant_id: actor.tenant_id }] : [];
    }
    if (normalized.startsWith('SELECT u.phone')) return []; // No contact channels exist in this fixture.
    if (normalized.startsWith('SELECT a.*, u.name AS student_name')) {
      return Array.from(this.applications.values()).filter((row) => {
        const student = this.users.get(row.student_user_id);
        return row.tenant_id === args[0] && row.status === 'PENDING_GUIDE' && (!row.guide_faculty_user_id || row.guide_faculty_user_id === args[1]) && student?.tenant_id === row.tenant_id && !student.deleted_at;
      }).map((row) => ({ ...row, student_name: 'Synthetic student', config_title: 'Synthetic grant call' }));
    }
    if (normalized.startsWith('SELECT a.* FROM academic_rnd_applications')) {
      const row = this.applications.get(String(args[0]));
      const student = row && this.users.get(row.student_user_id);
      return row && student && row.tenant_id === args[1] && student.tenant_id === row.tenant_id && !student.deleted_at ? [{ ...row }] : [];
    }
    if (normalized.startsWith('UPDATE academic_rnd_applications')) {
      const row = this.applications.get(String(args[0]));
      if (this.updateConflict || !row || row.tenant_id !== args[1] || row.status !== 'PENDING_GUIDE' || (row.guide_faculty_user_id && row.guide_faculty_user_id !== args[2])) return [[], 0];
      row.status = String(args[3]);
      // Installed TypeORM PostgresQueryRunner returns [raw.rows, raw.rowCount] for UPDATE.
      return [[{ ...row }], 1];
    }
    if (normalized.startsWith('INSERT INTO academic_rnd_approvals')) {
      if (this.auditFailure) throw new Error('Synthetic audit storage unavailable');
      this.approvals.push({ tenant_id: String(args[0]), application_id: String(args[1]), approver_user_id: String(args[2]), approval_tier: 'GUIDE', status: String(args[3]), remarks: args[4] == null ? null : String(args[4]) });
      return [];
    }
    throw new Error(`Unconfigured synthetic query: ${normalized}`);
  }
}

describe('Research grant guide HTTP acceptance (production Nest + synthetic persistence)', () => {
  let app: INestApplication;
  let store: SyntheticGrantStore;
  const notifier = { academicRndStatusUpdated: jest.fn() };
  const integrations = { queueWhatsApp: jest.fn() };
  const query = jest.fn((sql: string, args?: unknown[]) => store.query(sql, args));
  const transaction = jest.fn((work: (manager: EntityManager) => Promise<unknown>) => store.transaction(work));
  const jwt = new JwtService({ secret: TEST_KEY });
  const prefix = '/api/academic-rnd/approvals/guide';
  function token(changes: Partial<Principal> = {}, secret?: string) {
    return jwt.sign({ user_id: FACULTY, tenant_id: TENANT, role: 'Faculty', roles: ['Faculty'], ...changes }, { expiresIn: '5m', ...(secret ? { secret } : {}) });
  }
  function post(id = APPLICATION, action = 'approve', body: Record<string, unknown> = {}, auth = token()) {
    return request(app.getHttpServer()).post(`${prefix}/${id}/${action}`).set('Authorization', `Bearer ${auth}`).send(body);
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [AcademicRndController],
      providers: [SyntheticJwtStrategy, JwtAuthGuard, RolesGuard, {
        provide: AcademicRndService,
        useFactory: () => new AcademicRndService({ query, transaction } as unknown as DataSource, notifier as never, integrations as never),
      }],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  beforeEach(() => { store = new SyntheticGrantStore(); jest.clearAllMocks(); });
  afterAll(async () => { await app?.close(); });

  it('rejects missing and incorrectly signed sessions before persistence is consulted', async () => {
    await request(app.getHttpServer()).get(`${prefix}/pending`).expect(401);
    await post(APPLICATION, 'approve', {}, token({}, 'different-test-only-key')).expect(401);
    expect(query).not.toHaveBeenCalled(); expect(transaction).not.toHaveBeenCalled();
  });

  it('uses the production role guard to reject a Student decision', async () => {
    await post(APPLICATION, 'approve', {}, token({ user_id: STUDENT, role: 'Student', roles: ['Student'] })).expect(403);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('lists only the current guide and common queue in the authenticated university', async () => {
    store.add('d4000000-0000-4000-8000-000000000003', OTHER_FACULTY);
    store.add('d4000000-0000-4000-8000-000000000004', FACULTY, { status: 'PENDING_BUDGET' });
    store.add('d4000000-0000-4000-8000-000000000005', FACULTY, { tenant_id: OTHER_TENANT, student_user_id: OTHER_STUDENT });
    const result = await request(app.getHttpServer()).get(`${prefix}/pending`).set('Authorization', `Bearer ${token()}`).expect(200);
    expect(result.body.map((row: SyntheticApplication) => row.application_id)).toEqual([APPLICATION, COMMON_APPLICATION]);
  });

  it('approves through controller and service, records trimmed audit remarks and removes the item from the queue', async () => {
    const result = await post(APPLICATION, 'approve', { remarks: '  Technically sound  ' }).expect(201);
    expect(result.body).toEqual(expect.objectContaining({ application_id: APPLICATION, status: 'PENDING_BUDGET' }));
    expect(store.applications.get(APPLICATION)?.status).toBe('PENDING_BUDGET');
    expect(store.approvals).toEqual([{ tenant_id: TENANT, application_id: APPLICATION, approver_user_id: FACULTY, approval_tier: 'GUIDE', status: 'APPROVED', remarks: 'Technically sound' }]);
    const queue = await request(app.getHttpServer()).get(`${prefix}/pending`).set('Authorization', `Bearer ${token()}`).expect(200);
    expect(queue.body.map((row: SyntheticApplication) => row.application_id)).toEqual([COMMON_APPLICATION]);
    expect(notifier.academicRndStatusUpdated).toHaveBeenCalledTimes(1);
    expect(integrations.queueWhatsApp).not.toHaveBeenCalled();
  });

  it('permits an unassigned common-queue application and normalizes optional blank approval remarks', async () => {
    await post(COMMON_APPLICATION, 'approve', { remarks: '   ' }).expect(201);
    expect(store.approvals[0].remarks).toBeNull();
  });

  it('rejects a grant with a real trimmed reason and preserves the rejection audit', async () => {
    const result = await post(APPLICATION, 'reject', { remarks: '  Missing study design  ' }).expect(201);
    expect(result.body.status).toBe('GUIDE_REJECTED');
    expect(store.approvals[0]).toEqual(expect.objectContaining({ status: 'REJECTED', remarks: 'Missing study design' }));
  });

  it.each([{}, { remarks: 123 }, { remarks: null }])('rejects malformed rejection DTO %j before beginning a transaction', async (body) => {
    const result = await post(APPLICATION, 'reject', body).expect(400);
    expect(result.body.message).toEqual(expect.arrayContaining(['remarks must be a string']));
    expect(transaction).not.toHaveBeenCalled(); expect(store.approvals).toHaveLength(0);
  });

  it('rejects whitespace rejection remarks and invalid IDs without modifying the application', async () => {
    await post(APPLICATION, 'reject', { remarks: '   ' }).expect(400);
    await post('not-an-application-id').expect(400);
    expect(store.applications.get(APPLICATION)?.status).toBe('PENDING_GUIDE');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('denies a different guide, a cross-university identity and an inactive actor', async () => {
    store.applications.get(APPLICATION)!.guide_faculty_user_id = OTHER_FACULTY;
    await post().expect(403);
    store.applications.get(APPLICATION)!.guide_faculty_user_id = FACULTY;
    await post(APPLICATION, 'approve', {}, token({ tenant_id: OTHER_TENANT })).expect(403);
    store.users.get(FACULTY)!.is_active = false;
    await post().expect(403);
    expect(store.applications.get(APPLICATION)?.status).toBe('PENDING_GUIDE');
    expect(store.approvals).toHaveLength(0);
  });

  it('returns not found for an application belonging to another university', async () => {
    store.applications.get(APPLICATION)!.tenant_id = OTHER_TENANT;
    store.applications.get(APPLICATION)!.student_user_id = OTHER_STUDENT;
    await post().expect(404);
    expect(store.approvals).toHaveLength(0);
  });

  it('refuses a repeated decision without creating another audit or notification', async () => {
    await post().expect(201);
    await post().expect(400);
    expect(store.approvals).toHaveLength(1);
    expect(notifier.academicRndStatusUpdated).toHaveBeenCalledTimes(1);
  });

  it('accepts only one of two competing HTTP decisions against the synthetic locked transaction', async () => {
    const results = await Promise.all([
      post(APPLICATION, 'approve', { remarks: 'Approve synthetic study' }),
      post(APPLICATION, 'reject', { remarks: 'Reject synthetic study' }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 400]);
    expect(store.approvals).toHaveLength(1);
    const accepted = results.find((result) => result.status === 201)!;
    expect(store.applications.get(APPLICATION)?.status).toBe(accepted.body.status);
    expect(notifier.academicRndStatusUpdated).toHaveBeenCalledTimes(1);
  });

  it('treats the real zero-row UPDATE tuple as a conflict and does not record approval', async () => {
    store.updateConflict = true;
    await post().expect(409);
    expect(store.applications.get(APPLICATION)?.status).toBe('PENDING_GUIDE');
    expect(store.approvals).toHaveLength(0);
    expect(notifier.academicRndStatusUpdated).not.toHaveBeenCalled();
  });

  it('rolls back the synthetic transaction when audit insertion fails and emits no success notification', async () => {
    store.auditFailure = true;
    await post().expect(500);
    expect(store.applications.get(APPLICATION)?.status).toBe('PENDING_GUIDE');
    expect(store.approvals).toHaveLength(0);
    expect(notifier.academicRndStatusUpdated).not.toHaveBeenCalled();
  });
});
