import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
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

describe('official document HTTP authorization (fixture authentication, mocked services)', () => {
  const tenant = '11111111-1111-4111-8111-111111111111';
  const actor = '22222222-2222-4222-8222-222222222222';
  const transcript = '33333333-3333-4333-8333-333333333333';
  const gradeCards = {
    generateGradeCards: jest.fn(),
    publishProvisional: jest.fn(),
    finalize: jest.fn(),
  };
  const transcripts = {
    requestForSemester: jest.fn(),
    approve: jest.fn(),
    listForTenant: jest.fn(),
  };
  const paths = [
    '/grade-cards/generate',
    '/grade-cards/publish-provisional',
    '/grade-cards/finalize',
    '/transcripts/generate',
    `/transcripts/${transcript}/approve`,
  ];
  let app: INestApplication<App>;

  beforeAll(async () => {
    const auth: CanActivate = {
      canActivate(context: ExecutionContext) {
        const req = context.switchToHttp().getRequest<{
          headers: Record<string, string | undefined>;
          user?: unknown;
        }>();
        const role = req.headers['x-test-role'];
        if (!role) throw new UnauthorizedException();
        req.user = {
          user_id: actor,
          tenant_id: req.headers['x-no-tenant'] ? undefined : tenant,
          role,
          primaryRole: req.headers['x-primary-role'] ?? role,
        };
        return true;
      },
    };
    const module = await Test.createTestingModule({
      controllers: [ExamCellController],
      providers: [
        RolesGuard,
        ...[
          ExamCellService,
          ResultControlService,
          ExamCellAuditService,
          ExamCellSessionsService,
          ExamCellOperationsService,
          ExamCellEnterpriseService,
          ExamCellDevService,
        ].map((provide) => ({ provide, useValue: {} })),
        { provide: SemesterResultsService, useValue: gradeCards },
        { provide: OfficialTranscriptService, useValue: transcripts },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(auth)
      .compile();
    app = module.createNestApplication<INestApplication<App>>();
    await app.init();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    for (const mock of [
      ...Object.values(gradeCards),
      ...Object.values(transcripts),
    ]) {
      mock.mockResolvedValue({ ok: true });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  function expectNoServiceAccess() {
    for (const mock of [
      ...Object.values(gradeCards),
      ...Object.values(transcripts),
    ]) {
      expect(mock).not.toHaveBeenCalled();
    }
  }

  it.each(['Student', 'ExamOperator'])(
    'denies %s on every document mutation before service access',
    async (role) => {
      for (const path of paths) {
        await request(app.getHttpServer())
          .post('/api/exam-cell' + path)
          .set('x-test-role', role)
          .send({ semester: 4 })
          .expect(403);
      }
      expectNoServiceAccess();
    },
  );

  it('rejects missing authentication before service access', async () => {
    for (const path of paths) {
      await request(app.getHttpServer())
        .post('/api/exam-cell' + path)
        .send({ semester: 4 })
        .expect(401);
    }
    expectNoServiceAccess();
  });

  it('rejects missing authenticated tenant even when a tenant is supplied in the body', async () => {
    for (const path of paths) {
      await request(app.getHttpServer())
        .post('/api/exam-cell' + path)
        .set('x-test-role', 'ExamCell')
        .set('x-no-tenant', '1')
        .send({ semester: 4, tenant_id: tenant })
        .expect(403);
    }
    expectNoServiceAccess();
  });

  it.each(['ExamCell', 'DeputyCOE'])(
    'preserves authorized %s access and forwards only authenticated tenant and actor',
    async (role) => {
      for (const path of paths) {
        await request(app.getHttpServer())
          .post('/api/exam-cell' + path)
          .set('x-test-role', role)
          .send({
            semester: 4,
            tenant_id: 'forged-tenant',
            user_id: 'forged-actor',
          })
          .expect(201);
      }
      expect(gradeCards.generateGradeCards).toHaveBeenCalledWith(tenant, 4);
      expect(gradeCards.publishProvisional).toHaveBeenCalledWith(tenant, 4);
      expect(gradeCards.finalize).toHaveBeenCalledWith(tenant, 4);
      expect(transcripts.requestForSemester).toHaveBeenCalledWith(
        tenant,
        4,
        expect.objectContaining({ userId: actor, role }),
        true,
      );
      expect(transcripts.approve).toHaveBeenCalledWith(
        tenant,
        transcript,
        expect.objectContaining({ userId: actor, role }),
      );
    },
  );

  it('allows existing ExamAdmin generation permission but not publication or transcript approval', async () => {
    await request(app.getHttpServer())
      .post('/api/exam-cell/grade-cards/generate')
      .set('x-test-role', 'ExamAdmin')
      .send({ semester: 4 })
      .expect(201);
    expect(gradeCards.generateGradeCards).toHaveBeenCalledWith(tenant, 4);
    for (const path of paths.slice(1)) {
      await request(app.getHttpServer())
        .post('/api/exam-cell' + path)
        .set('x-test-role', 'ExamAdmin')
        .send({ semester: 4 })
        .expect(403);
    }
    expect(gradeCards.publishProvisional).not.toHaveBeenCalled();
    expect(gradeCards.finalize).not.toHaveBeenCalled();
    expect(transcripts.requestForSemester).not.toHaveBeenCalled();
    expect(transcripts.approve).not.toHaveBeenCalled();
  });

  it('does not elevate an active ExamOperator role using an additional ExamCell role', async () => {
    for (const path of paths) {
      await request(app.getHttpServer())
        .post('/api/exam-cell' + path)
        .set('x-test-role', 'ExamCell')
        .set('x-primary-role', 'ExamOperator')
        .send({ semester: 4 })
        .expect(403);
    }
    expectNoServiceAccess();
  });

  it('rejects an unauthenticated transcript list request before service access', async () => {
    await request(app.getHttpServer())
      .get('/api/exam-cell/transcripts')
      .expect(401);
    expect(transcripts.listForTenant).not.toHaveBeenCalled();
  });

  it.each(['Student', 'Faculty', 'Accountant'])(
    'denies %s access to the Exam Cell transcript listing',
    async (role) => {
      await request(app.getHttpServer())
        .get('/api/exam-cell/transcripts')
        .set('x-test-role', role)
        .expect(403);
      expect(transcripts.listForTenant).not.toHaveBeenCalled();
    },
  );

  it('rejects a missing authenticated tenant on transcript listing despite a forged query tenant', async () => {
    await request(app.getHttpServer())
      .get('/api/exam-cell/transcripts?tenant_id=' + tenant)
      .set('x-test-role', 'ExamCell')
      .set('x-no-tenant', '1')
      .expect(403);
    expect(transcripts.listForTenant).not.toHaveBeenCalled();
  });

  it.each(['ExamCell', 'DeputyCOE', 'ExamAdmin', 'ExamOperator'])(
    'preserves %s transcript list access with only the authenticated tenant and supported filters',
    async (role) => {
      const row = {
        transcript_id: transcript,
        student_name: 'Declared result student',
        semester: 4,
        status: 'GENERATED',
      };
      transcripts.listForTenant.mockResolvedValueOnce([row]);
      const result = await request(app.getHttpServer())
        .get('/api/exam-cell/transcripts')
        .query({ semester: 4, status: 'GENERATED', tenant_id: 'forged-tenant' })
        .set('x-test-role', role)
        .expect(200);
      expect(result.body).toEqual([row]);
      expect(transcripts.listForTenant).toHaveBeenCalledWith(tenant, {
        semester: 4,
        status: 'GENERATED',
      });
    },
  );
});
