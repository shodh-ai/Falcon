import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ExamCellController } from './exam-cell.controller';
import { ExamCellService } from './exam-cell.service';
import { ExamCellEnterpriseService } from './exam-cell-enterprise.service';
import { ResultControlService } from './result-control.service';
import { SemesterResultsService } from './semester-results.service';
import { ExamCellAuditService } from './exam-cell-audit.service';
import { ExamCellSessionsService } from './exam-cell-sessions.service';
import { ExamCellOperationsService } from './exam-cell-operations.service';
import { ExamCellDevService } from './exam-cell-dev.service';
import { OfficialTranscriptService } from './official-transcript.service';

// Actual controller, DTO validation, active-role checks, RolesGuard and core
// delegation. JWT identity, database reads and the timetable writer are fixtures;
// PostgreSQL persistence/locking is tested in the isolated integration suite.
describe('session-linked Hall Ticket timetable HTTP security', () => {
  const tenant = '11111111-1111-4111-8111-111111111111';
  const actor = '22222222-2222-4222-8222-222222222222';
  const session = '33333333-3333-4333-8333-333333333333';
  const scheduleId = '44444444-4444-4444-8444-444444444444';
  const otherTenant = '55555555-5555-4555-8555-555555555555';
  const body = {
    session_id: session,
    exam_type: 'END_TERM',
    subject_id: 7,
    exam_date: '2026-11-05',
    start_time: '09:00',
    end_time: '12:00',
    venue: 'Disposable test hall',
  };
  const stored = {
    exam_schedule_id: scheduleId,
    tenant_id: tenant,
    ...body,
  };
  const create = jest.fn();
  const releaseSessionTimetable = jest.fn();
  const query = jest.fn<Promise<unknown[]>, [string, unknown[]?]>();
  let app: INestApplication<App>;

  beforeAll(async () => {
    const authentication: CanActivate = {
      canActivate(context: ExecutionContext) {
        const req = context.switchToHttp().getRequest<{
          headers: Record<string, string | undefined>;
          user?: object;
        }>();
        const role = req.headers['x-fixture-role'];
        if (!role) throw new UnauthorizedException();
        req.user = {
          user_id: actor,
          tenant_id: req.headers['x-fixture-tenant'] ?? tenant,
          role,
          primaryRole: req.headers['x-fixture-primary-role'] ?? role,
        };
        return true;
      },
    };
    const core = new ExamCellService(
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { create, releaseSession: releaseSessionTimetable } as never,
    );
    const module = await Test.createTestingModule({
      controllers: [ExamCellController],
      providers: [
        RolesGuard,
        { provide: ExamCellService, useValue: core },
        ...[
          ExamCellEnterpriseService,
          ResultControlService,
          SemesterResultsService,
          ExamCellAuditService,
          ExamCellSessionsService,
          ExamCellOperationsService,
          ExamCellDevService,
          OfficialTranscriptService,
        ].map((provide) => ({ provide, useValue: {} })),
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(authentication)
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => app?.close());

  beforeEach(() => {
    jest.clearAllMocks();
    create.mockResolvedValue([stored]);
    releaseSessionTimetable.mockResolvedValue([
      { ...stored, status: 'RELEASED' },
    ]);
    query.mockImplementation((sql) => {
      if (sql.includes('FROM exam_sessions'))
        return Promise.resolve([{ session_id: session }]);
      if (sql.includes('FROM exam_schedules')) return Promise.resolve([stored]);
      return Promise.reject(new Error(`Unexpected query: ${sql}`));
    });
  });

  it.each(['ExamCell', 'DeputyCOE', 'ExamAdmin', 'SuperAdmin'])(
    'permits existing schedule-manager role %s with authenticated identity and preserves the array response',
    async (role) => {
      const response = await request(app.getHttpServer())
        .post('/api/exam-cell/schedules')
        .set('x-fixture-role', role)
        .send(body)
        .expect(201);
      expect(response.body).toEqual([stored]);
      expect(create).toHaveBeenCalledWith(tenant, actor, role, body);
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('passes the active primary role rather than inferring authority from another role', async () => {
    await request(app.getHttpServer())
      .post('/api/exam-cell/schedules')
      .set('x-fixture-role', 'ExamCell')
      .set('x-fixture-primary-role', 'DeputyCOE')
      .send(body)
      .expect(201);
    expect(create).toHaveBeenCalledWith(tenant, actor, 'DeputyCOE', body);
  });

  it('allows only the confirmed ExamCell role to release a session timetable', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/exam-cell/sessions/${session}/timetable/release`)
      .set('x-fixture-role', 'ExamCell')
      .send({})
      .expect(201);
    expect(response.body).toEqual([{ ...stored, status: 'RELEASED' }]);
    expect(releaseSessionTimetable).toHaveBeenCalledWith(
      tenant,
      actor,
      'ExamCell',
      session,
    );
  });

  it.each(['DeputyCOE', 'ExamAdmin', 'ExamOperator', 'SuperAdmin'])(
    'does not allow %s to release a timetable',
    async (role) => {
      await request(app.getHttpServer())
        .post(`/api/exam-cell/sessions/${session}/timetable/release`)
        .set('x-fixture-role', role)
        .send({})
        .expect(403);
      expect(releaseSessionTimetable).not.toHaveBeenCalled();
    },
  );

  it('does not use a secondary ExamCell role when DeputyCOE is the active role', async () => {
    await request(app.getHttpServer())
      .post(`/api/exam-cell/sessions/${session}/timetable/release`)
      .set('x-fixture-role', 'ExamCell')
      .set('x-fixture-primary-role', 'DeputyCOE')
      .send({})
      .expect(403);
    expect(releaseSessionTimetable).not.toHaveBeenCalled();
  });

  it('does not elevate an active operator using a secondary administrator role', async () => {
    await request(app.getHttpServer())
      .post('/api/exam-cell/schedules')
      .set('x-fixture-role', 'SuperAdmin')
      .set('x-fixture-primary-role', 'ExamOperator')
      .send(body)
      .expect(403);
    expect(create).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it.each(['ExamOperator', 'Accountant', 'Student', 'Faculty', 'CampusAdmin'])(
    'denies timetable mutation by %s',
    async (role) => {
      await request(app.getHttpServer())
        .post('/api/exam-cell/schedules')
        .set('x-fixture-role', role)
        .send(body)
        .expect(403);
      expect(create).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('requires authentication before creating or listing schedules', async () => {
    await request(app.getHttpServer())
      .post('/api/exam-cell/schedules')
      .send(body)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/exam-cell/schedules?session_id=${session}`)
      .expect(401);
    expect(create).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects missing authenticated tenant context before reads or delegated writes', async () => {
    await request(app.getHttpServer())
      .post('/api/exam-cell/schedules')
      .set('x-fixture-role', 'ExamCell')
      .set('x-fixture-tenant', ' ')
      .send(body)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/exam-cell/schedules?session_id=${session}`)
      .set('x-fixture-role', 'ExamCell')
      .set('x-fixture-tenant', ' ')
      .expect(403);
    expect(create).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    { tenant_id: otherTenant },
    { actor_user_id: otherTenant },
    { user_id: otherTenant },
    { role: 'SuperAdmin' },
    { stage: 'APPROVED' },
    { unexpected: 'value' },
  ])(
    'rejects client-supplied authority or unknown body fields %p',
    async (extra) => {
      await request(app.getHttpServer())
        .post('/api/exam-cell/schedules')
        .set('x-fixture-role', 'ExamCell')
        .send({ ...body, ...extra })
        .expect(400);
      expect(create).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
    },
  );

  it.each([
    { session_id: undefined },
    { session_id: '' },
    { session_id: 'not-a-session' },
    { exam_date: '2026-02-30' },
    { exam_date: '2026-11-05T09:00:00Z' },
    { start_time: '24:00' },
    { end_time: '12:60' },
    { exam_type: 'UNVERIFIED_EXAM_TYPE' },
    { subject_id: 0 },
    { venue: ' ' },
    { max_marks: 0 },
  ])(
    'validates timetable DTO before service delegation for %p',
    async (change) => {
      await request(app.getHttpServer())
        .post('/api/exam-cell/schedules')
        .set('x-fixture-role', 'ExamCell')
        .send({ ...body, ...change })
        .expect(400);
      expect(create).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('checks authenticated session ownership before strictly scoped timetable reads', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `/api/exam-cell/schedules?session_id=${session}&tenant_id=${otherTenant}`,
      )
      .set('x-fixture-role', 'ExamCell')
      .expect(200);
    expect(response.body).toEqual([stored]);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]).toEqual([
      expect.stringContaining(
        'FROM exam_sessions WHERE tenant_id=$1 AND session_id=$2',
      ),
      [tenant, session],
    ]);
    const [sql, params] = query.mock.calls[1];
    expect(sql).toContain('es.tenant_id=$1 AND es.session_id=$2');
    expect(sql).toContain('es.deleted_at IS NULL');
    expect(sql).not.toContain('tenant_id IS NULL');
    expect(sql).not.toMatch(/\bOR\b/);
    expect(params).toEqual([tenant, session]);
    expect(create).not.toHaveBeenCalled();
  });

  it('does not fall back to all schedules for a foreign or missing session', async () => {
    query.mockResolvedValue([]);
    await request(app.getHttpServer())
      .get(`/api/exam-cell/schedules?session_id=${session}`)
      .set('x-fixture-role', 'ExamCell')
      .expect(404);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('FROM exam_sessions');
    expect(create).not.toHaveBeenCalled();
  });

  it.each(['', 'not-a-session'])(
    'rejects invalid explicit session %p without querying global schedules',
    async (value) => {
      await request(app.getHttpServer())
        .get(`/api/exam-cell/schedules?session_id=${encodeURIComponent(value)}`)
        .set('x-fixture-role', 'ExamCell')
        .expect(400);
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('rejects invalid authenticated tenant context on scoped reads even when a query tenant is supplied', async () => {
    await request(app.getHttpServer())
      .get(`/api/exam-cell/schedules?session_id=${session}&tenant_id=${tenant}`)
      .set('x-fixture-role', 'ExamCell')
      .set('x-fixture-tenant', 'invalid')
      .expect(403);
    expect(query).not.toHaveBeenCalled();
  });

  it.each(['Accountant', 'Student'])(
    'does not expose the workspace timetable to %s',
    async (role) => {
      await request(app.getHttpServer())
        .get(`/api/exam-cell/schedules?session_id=${session}`)
        .set('x-fixture-role', role)
        .expect(403);
      expect(query).not.toHaveBeenCalled();
    },
  );
});
