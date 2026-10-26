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
import { ResultControlService } from './result-control.service';
import { SemesterResultsService } from './semester-results.service';
import { ExamCellAuditService } from './exam-cell-audit.service';
import { ExamCellSessionsService } from './exam-cell-sessions.service';
import { ExamCellOperationsService } from './exam-cell-operations.service';
import { ExamCellEnterpriseService } from './exam-cell-enterprise.service';
import { ExamCellDevService } from './exam-cell-dev.service';
import { OfficialTranscriptService } from './official-transcript.service';

// Real route, DTO and role guards; authentication and services are isolated fixtures.
describe('Exam Cell registration HTTP boundaries', () => {
  const tenant = '11111111-1111-4111-8111-111111111111';
  const actor = '22222222-2222-4222-8222-222222222222';
  const id = '33333333-3333-4333-8333-333333333333';
  const operations = {
    createFormWindow: jest.fn().mockResolvedValue({ window_id: id }),
    updateFormWindowStatus: jest.fn().mockResolvedValue({ window_id: id }),
    seedRegistrationsFromSemester: jest
      .fn()
      .mockResolvedValue({ created: 0, refreshed: 0, total_students: 0 }),
    reviewRegistration: jest.fn().mockResolvedValue({ registration_id: id }),
    listRegistrations: jest.fn().mockResolvedValue([]),
    listFormWindows: jest.fn().mockResolvedValue([]),
  };
  const base = '/api/exam-cell';
  const createBody = {
    title: 'Fixture',
    session_id: id,
    semester: 4,
    program_label: 'BTECH CSE',
    opens_at: '2026-10-01T00:00:00Z',
    closes_at: '2026-11-01T00:00:00Z',
  };
  const writes = [
    { path: `${base}/form-windows`, body: createBody },
    { path: `${base}/form-windows/${id}/status`, body: { status: 'OPEN' } },
    {
      path: `${base}/form-windows/${id}/sync-registrations`,
      body: { semester: 4 },
    },
    {
      path: `${base}/registrations/${id}/review`,
      body: { status: 'APPROVED' },
    },
  ];
  let app: INestApplication<App>;

  beforeAll(async () => {
    const authentication: CanActivate = {
      canActivate(context: ExecutionContext) {
        const req = context
          .switchToHttp()
          .getRequest<{
            headers: Record<string, string | undefined>;
            user?: object;
          }>();
        const role = req.headers['x-fixture-role'];
        if (!role) throw new UnauthorizedException();
        req.user = {
          user_id: actor,
          role: role === 'missing-tenant' ? 'ExamCell' : role,
          ...(role === 'missing-tenant' ? {} : { tenant_id: tenant }),
        };
        return true;
      },
    };
    const module = await Test.createTestingModule({
      controllers: [ExamCellController],
      providers: [
        RolesGuard,
        { provide: ExamCellOperationsService, useValue: operations },
        ...[
          ExamCellService,
          ResultControlService,
          SemesterResultsService,
          ExamCellAuditService,
          ExamCellSessionsService,
          ExamCellEnterpriseService,
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
  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => app?.close());

  it.each(['ExamCell', 'ExamAdmin', 'DeputyCOE', 'SuperAdmin'])(
    'retains existing %s registration write permissions',
    async (role) => {
      for (const route of writes)
        await request(app.getHttpServer())
          .post(route.path)
          .set('x-fixture-role', role)
          .send(route.body)
          .expect(201);
      expect(operations.seedRegistrationsFromSemester).toHaveBeenCalledWith(
        tenant,
        id,
        4,
        actor,
      );
      expect(operations.createFormWindow).toHaveBeenCalledWith(
        tenant,
        actor,
        expect.objectContaining(createBody),
      );
    },
  );

  it.each(['Student', 'Faculty', 'ExamOperator'])(
    'does not grant %s registration write permission',
    async (role) => {
      for (const route of writes)
        await request(app.getHttpServer())
          .post(route.path)
          .set('x-fixture-role', role)
          .send(route.body)
          .expect(403);
      for (const fn of Object.values(operations))
        expect(fn).not.toHaveBeenCalled();
    },
  );

  it('rejects missing authentication and tenant context before services', async () => {
    for (const route of writes) {
      await request(app.getHttpServer())
        .post(route.path)
        .send(route.body)
        .expect(401);
      await request(app.getHttpServer())
        .post(route.path)
        .set('x-fixture-role', 'missing-tenant')
        .send(route.body)
        .expect(403);
    }
    for (const fn of Object.values(operations))
      expect(fn).not.toHaveBeenCalled();
  });

  it('rejects forged tenant, invalid semester, missing session and unknown approval status', async () => {
    await request(app.getHttpServer())
      .post(writes[0].path)
      .set('x-fixture-role', 'ExamCell')
      .send({ ...createBody, tenant_id: id })
      .expect(400);
    await request(app.getHttpServer())
      .post(writes[0].path)
      .set('x-fixture-role', 'ExamCell')
      .send({ ...createBody, session_id: undefined })
      .expect(400);
    await request(app.getHttpServer())
      .post(writes[2].path)
      .set('x-fixture-role', 'ExamCell')
      .send({ semester: -1 })
      .expect(400);
    await request(app.getHttpServer())
      .post(writes[3].path)
      .set('x-fixture-role', 'ExamCell')
      .send({ status: 'PUBLISHED' })
      .expect(400);
    expect(operations.createFormWindow).not.toHaveBeenCalled();
    expect(operations.reviewRegistration).not.toHaveBeenCalled();
  });

  it('rejects invalid IDs before invoking write services', async () => {
    await request(app.getHttpServer())
      .post(`${base}/form-windows/not-a-uuid/sync-registrations`)
      .set('x-fixture-role', 'ExamCell')
      .send({ semester: 4 })
      .expect(400);
    await request(app.getHttpServer())
      .post(`${base}/registrations/not-a-uuid/review`)
      .set('x-fixture-role', 'ExamCell')
      .send({ status: 'APPROVED' })
      .expect(400);
    expect(operations.seedRegistrationsFromSemester).not.toHaveBeenCalled();
    expect(operations.reviewRegistration).not.toHaveBeenCalled();
  });

  it.each(['opens_at', 'closes_at'])(
    'rejects timezone-ambiguous %s before creating a form window',
    async (field) => {
      await request(app.getHttpServer())
        .post(writes[0].path)
        .set('x-fixture-role', 'ExamCell')
        .send({ ...createBody, [field]: '2026-10-01T10:00:00' })
        .expect(400);
      expect(operations.createFormWindow).not.toHaveBeenCalled();
    },
  );

  it('accepts explicit numeric timezone offsets', async () => {
    await request(app.getHttpServer())
      .post(writes[0].path)
      .set('x-fixture-role', 'ExamCell')
      .send({
        ...createBody,
        opens_at: '2026-10-01T10:00:00+05:30',
        closes_at: '2026-11-01T10:00:00+05:30',
      })
      .expect(201);
    expect(operations.createFormWindow).toHaveBeenCalled();
  });

  it('keeps existing staff reads tenant-scoped and denies student cross-student access', async () => {
    await request(app.getHttpServer())
      .get(`${base}/registrations`)
      .set('x-fixture-role', 'ExamOperator')
      .expect(200);
    expect(operations.listRegistrations).toHaveBeenCalledWith(
      tenant,
      expect.any(Object),
    );
    await request(app.getHttpServer())
      .get(`${base}/registrations`)
      .set('x-fixture-role', 'Student')
      .expect(403);
  });
});
