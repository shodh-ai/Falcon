import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  UnauthorizedException,
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

// Real HTTP/controller/role guards, fixture authentication and mocked delegates.
describe('Hall Ticket session preparation HTTP contract', () => {
  const tenant = '11111111-1111-4111-8111-111111111111';
  const actor = '22222222-2222-4222-8222-222222222222';
  const session = '33333333-3333-4333-8333-333333333333';
  const registration = '44444444-4444-4444-8444-444444444444';
  const prepare = jest.fn();
  const inspect = jest.fn();
  const legacy = jest.fn();
  let app: INestApplication<App>;
  beforeAll(async () => {
    const auth: CanActivate = {
      canActivate(context: ExecutionContext) {
        const req = context.switchToHttp().getRequest<{
          headers: Record<string, string | undefined>;
          user?: object;
        }>();
        const role = req.headers['x-test-role'];
        if (!role) throw new UnauthorizedException();
        req.user = {
          user_id: actor,
          tenant_id: req.headers['x-test-tenant'] ?? tenant,
          role,
          primaryRole: req.headers['x-test-active-role'] ?? role,
        };
        return true;
      },
    };
    const module = await Test.createTestingModule({
      controllers: [ExamCellController],
      providers: [
        RolesGuard,
        {
          provide: ExamCellEnterpriseService,
          useValue: {
            prepareHallTicketApprovals: prepare,
            inspectHallTicketReadiness: inspect,
            syncHallTicketApprovals: legacy,
          },
        },
        ...[
          ExamCellService,
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
      .useValue(auth)
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => app?.close());
  beforeEach(() => {
    jest.clearAllMocks();
    prepare.mockResolvedValue({ synced: 1, total: 1 });
    inspect.mockResolvedValue({ diagnostic_only: true, ready_to_issue: false });
  });
  it('forwards exact session with authenticated actor/tenant, ignoring forged authority fields', async () => {
    await request(app.getHttpServer())
      .post('/api/exam-cell/hall-ticket-approvals/sync')
      .set('x-test-role', 'ExamCell')
      .send({
        session_id: session,
        tenant_id: registration,
        role: 'SuperAdmin',
        actor_user_id: registration,
        stage: 'APPROVED',
        semester: 99,
      })
      .expect(201);
    expect(prepare).toHaveBeenCalledWith(tenant, session, actor, 'ExamCell');
    expect(legacy).not.toHaveBeenCalled();
  });
  it.each(['ExamOperator', 'Accountant', 'Student', 'Faculty', 'CampusAdmin'])(
    'denies preparation for %s',
    async (role) => {
      await request(app.getHttpServer())
        .post('/api/exam-cell/hall-ticket-approvals/sync')
        .set('x-test-role', role)
        .send({ session_id: session })
        .expect(403);
      expect(prepare).not.toHaveBeenCalled();
    },
  );
  it('does not promote a secondary ExamCell role over the active operator role', async () => {
    await request(app.getHttpServer())
      .post('/api/exam-cell/hall-ticket-approvals/sync')
      .set('x-test-role', 'ExamCell')
      .set('x-test-active-role', 'ExamOperator')
      .send({ session_id: session })
      .expect(403);
    expect(prepare).not.toHaveBeenCalled();
  });
  it('rejects missing authenticated tenant even with a body tenant', async () => {
    await request(app.getHttpServer())
      .post('/api/exam-cell/hall-ticket-approvals/sync')
      .set('x-test-role', 'ExamCell')
      .set('x-test-tenant', ' ')
      .send({ session_id: session, tenant_id: tenant })
      .expect(403);
    expect(prepare).not.toHaveBeenCalled();
  });
  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .post('/api/exam-cell/hall-ticket-approvals/sync')
      .send({ session_id: session })
      .expect(401);
    expect(prepare).not.toHaveBeenCalled();
  });
  it('routes exact registration diagnostics without issuing or approving', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `/api/exam-cell/admit-cards/audit?session_id=${session}&registration_id=${registration}&tenant_id=${actor}`,
      )
      .set('x-test-role', 'ExamCell')
      .expect(200);
    expect(inspect).toHaveBeenCalledWith(
      tenant,
      session,
      registration,
      'ExamCell',
    );
    expect(response.body).toMatchObject({
      diagnostic_only: true,
      ready_to_issue: false,
    });
    expect(prepare).not.toHaveBeenCalled();
  });
  it.each([
    '',
    '?batch_label=B.Tech%20Sem4&semester=4',
    `?session_id=${session}`,
    `?registration_id=${registration}`,
    `?session_id=not-a-session&registration_id=${registration}`,
    `?session_id=${session}&registration_id=not-a-registration`,
  ])(
    'rejects missing or invalid exact identities instead of legacy batch fallback: %s',
    async (query) => {
      await request(app.getHttpServer())
        .get(`/api/exam-cell/admit-cards/audit${query}`)
        .set('x-test-role', 'ExamCell')
        .expect(400);
      expect(inspect).not.toHaveBeenCalled();
      expect(prepare).not.toHaveBeenCalled();
      expect(legacy).not.toHaveBeenCalled();
    },
  );
});
