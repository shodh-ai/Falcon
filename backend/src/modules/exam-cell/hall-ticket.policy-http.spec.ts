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

// Actual controller, role guard and service interlocks. Fixture authentication,
// no database: this is not a PostgreSQL concurrency or successful-issuance test.
describe('hall-ticket policy HTTP boundaries', () => {
  const tenant = '11111111-1111-4111-8111-111111111111';
  const actor = '22222222-2222-4222-8222-222222222222';
  const query = jest.fn();
  const log = jest.fn();
  const pdf = jest.fn();
  const routes = [
    '/admit-cards/generate',
    '/hall-ticket-approvals/sync',
    `/hall-ticket-approvals/${actor}/advance`,
    '/hall-ticket-approvals/bulk-approve',
  ];
  const forgedBody = {
    semester: 4,
    batch_label: 'Fixture',
    action: 'APPROVE',
    stage: 'APPROVED',
    target_stage: 'APPROVED',
    tenant_id: actor,
    role: 'SuperAdmin',
    policy_confirmed: true,
  };
  const validBodies = [
    { semester: 4, batch_label: 'Fixture' },
    { semester: 4, batch_label: 'Fixture' },
    { action: 'APPROVE' },
    { session_id: tenant, approval_ids: [actor] },
  ];
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
          role,
          tenant_id: req.headers['x-fixture-tenant'] ?? tenant,
          primaryRole: req.headers['x-fixture-primary-role'],
        };
        return true;
      },
    };
    const core = new ExamCellService(
      { query } as never,
      {} as never,
      { generate: pdf } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { log } as never,
    );
    const enterprise = new ExamCellEnterpriseService(
      { query } as never,
      {} as never,
      {} as never,
      { log } as never,
    );
    const module = await Test.createTestingModule({
      controllers: [ExamCellController],
      providers: [
        RolesGuard,
        { provide: ExamCellService, useValue: core },
        { provide: ExamCellEnterpriseService, useValue: enterprise },
        { provide: ExamCellAuditService, useValue: { log } },
        ...[
          ResultControlService,
          SemesterResultsService,
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
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });
  afterAll(async () => app?.close());
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => {
    expect(query).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(pdf).not.toHaveBeenCalled();
  });

  it.each(['ExamCell', 'DeputyCOE', 'ExamAdmin', 'SuperAdmin'])(
    '%s valid requests remain blocked without reads or writes while policy is unconfirmed',
    async (role) => {
      for (const [index, route] of routes.entries()) {
        const response = await request(app.getHttpServer())
          .post(`/api/exam-cell${route}`)
          .set('x-fixture-role', role)
          .send(validBodies[index])
          .expect(503);
        expect(response.body).toMatchObject({
          code: 'HALL_TICKET_POLICY_UNCONFIRMED',
          can_issue: false,
          can_approve: false,
        });
      }
    },
  );
  it.each(['ExamCell', 'Accountant'])(
    'rejects %s client-supplied target, identity and policy fields before the approval handler',
    async (role) => {
      for (const route of routes.slice(2)) {
        const response = await request(app.getHttpServer())
          .post(`/api/exam-cell${route}`)
          .set('x-fixture-role', role)
          .send(forgedBody)
          .expect(400);
        expect((response.body as { message: string[] }).message).toEqual(
          expect.arrayContaining([
            expect.stringContaining('property target_stage should not exist'),
          ]),
        );
      }
    },
  );
  it('keeps forged fields from enabling the legacy generation or batch sync writers', async () => {
    for (const route of routes.slice(0, 2))
      await request(app.getHttpServer())
        .post(`/api/exam-cell${route}`)
        .set('x-fixture-role', 'ExamCell')
        .send(forgedBody)
        .expect(503);
  });
  it('rejects ExamOperator approval but preserves its separate generation permission gate', async () => {
    for (const [index, route] of routes.entries())
      await request(app.getHttpServer())
        .post(`/api/exam-cell${route}`)
        .set('x-fixture-role', 'ExamOperator')
        .send(validBodies[index])
        .expect(route === routes[0] ? 503 : 403);
  });
  it.each(['Student', 'Faculty', 'CampusAdmin'])(
    '%s cannot call these mutation routes',
    async (role) => {
      for (const [index, route] of routes.entries())
        await request(app.getHttpServer())
          .post(`/api/exam-cell${route}`)
          .set('x-fixture-role', role)
          .send(validBodies[index])
          .expect(403);
    },
  );
  it('admits Accountant only to the blocked approval methods, not the workspace or other mutations', async () => {
    for (const [index, route] of routes.entries())
      await request(app.getHttpServer())
        .post(`/api/exam-cell${route}`)
        .set('x-fixture-role', 'Accountant')
        .send(validBodies[index])
        .expect(index < 2 ? 403 : 503);
    await request(app.getHttpServer())
      .get('/api/exam-cell/hall-ticket-approvals')
      .set('x-fixture-role', 'Accountant')
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/exam-cell/dashboard')
      .set('x-fixture-role', 'Accountant')
      .expect(403);
  });
  it('requires authentication', async () => {
    for (const route of routes)
      await request(app.getHttpServer())
        .post(`/api/exam-cell${route}`)
        .send(forgedBody)
        .expect(401);
  });
  it.each(['', 'invalid-tenant'])(
    'does not accept body tenant in place of authenticated tenant %p',
    async (value) => {
      for (const [index, route] of routes.entries())
        await request(app.getHttpServer())
          .post(`/api/exam-cell${route}`)
          .set('x-fixture-role', 'ExamCell')
          .set('x-fixture-tenant', value)
          .send(validBodies[index])
          .expect(403);
    },
  );
  it('uses the active primary role, not another role or client body role', async () => {
    await request(app.getHttpServer())
      .post(`/api/exam-cell${routes[2]}`)
      .set('x-fixture-role', 'SuperAdmin')
      .set('x-fixture-primary-role', 'ExamOperator')
      .send(validBodies[2])
      .expect(403);
  });
  it('rejects a direct final-stage jump even with an otherwise valid individual action', async () => {
    await request(app.getHttpServer())
      .post(`/api/exam-cell${routes[2]}`)
      .set('x-fixture-role', 'ExamCell')
      .send({ action: 'APPROVE', stage: 'APPROVED' })
      .expect(400);
  });
  it('requires a rejection reason and an actual approval UUID', async () => {
    await request(app.getHttpServer())
      .post(`/api/exam-cell${routes[2]}`)
      .set('x-fixture-role', 'ExamCell')
      .send({ action: 'REJECT' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/exam-cell/hall-ticket-approvals/not-an-approval/advance')
      .set('x-fixture-role', 'ExamCell')
      .send({ action: 'APPROVE' })
      .expect(400);
  });
  it.each([
    { semester: 4, batch_label: 'Fixture', target_stage: 'COE' },
    { session_id: tenant, approval_ids: [] },
    { session_id: tenant, approval_ids: [actor, actor] },
    { session_id: tenant, approval_ids: ['not-an-approval'] },
  ])(
    'rejects invalid bulk scope %p before any database access',
    async (body) => {
      await request(app.getHttpServer())
        .post(`/api/exam-cell${routes[3]}`)
        .set('x-fixture-role', 'Accountant')
        .send(body)
        .expect(400);
    },
  );
});
