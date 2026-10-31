import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
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
import { QuestionPaperWorkflowService } from './question-paper-workflow.service';

describe('question-paper HTTP authorization and contracts (fixture authentication)', () => {
  const tenant = '11111111-1111-4111-8111-111111111111',
    actor = '22222222-2222-4222-8222-222222222222';
  const id = '33333333-3333-4333-8333-333333333333',
    version = '44444444-4444-4444-8444-444444444444';
  const base = '/api/exam-cell/question-papers';
  const operations = {
    listQuestionPapers: jest.fn(),
    createQuestionPaperRecord: jest.fn(),
    updateQuestionPaperStatus: jest.fn(),
  };
  const files = { upload: jest.fn(), versions: jest.fn(), download: jest.fn() };
  let app: INestApplication<App>;
  beforeAll(async () => {
    const auth: CanActivate = {
      canActivate(ctx: ExecutionContext) {
        const r = ctx.switchToHttp().getRequest<{
          headers: Record<string, string | undefined>;
          user?: unknown;
        }>();
        const role = r.headers['x-test-role'];
        if (!role) throw new UnauthorizedException();
        r.user = {
          user_id: actor,
          tenant_id: r.headers['x-no-tenant'] ? undefined : tenant,
          role,
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
          SemesterResultsService,
          ExamCellAuditService,
          ExamCellSessionsService,
          ExamCellEnterpriseService,
          ExamCellDevService,
          OfficialTranscriptService,
        ].map((provide) => ({ provide, useValue: {} })),
        { provide: ExamCellOperationsService, useValue: operations },
        { provide: QuestionPaperWorkflowService, useValue: files },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(auth)
      .compile();
    app = module.createNestApplication<INestApplication<App>>();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    operations.listQuestionPapers.mockResolvedValue([]);
    operations.createQuestionPaperRecord.mockResolvedValue({ qp_id: id });
    operations.updateQuestionPaperStatus.mockResolvedValue({
      status: 'UNDER_MODERATION',
    });
    files.upload.mockResolvedValue({ version_id: version });
    files.versions.mockResolvedValue([]);
    files.download.mockResolvedValue({
      buffer: Buffer.from('%PDF-test'),
      filename: 'paper.pdf',
    });
  });
  afterAll(async () => {
    await app.close();
  });
  it('preserves authenticated metadata access but does not expose files to read-only roles', async () => {
    await request(app.getHttpServer())
      .get(base)
      .set('x-test-role', 'ExamOperator')
      .expect(200);
    expect(operations.listQuestionPapers).toHaveBeenCalledWith(
      tenant,
      undefined,
    );
    await request(app.getHttpServer())
      .get(`${base}/${id}/file`)
      .set('x-test-role', 'ExamOperator')
      .expect(403);
    expect(files.download).not.toHaveBeenCalled();
  });
  it.each(['ExamOperator', 'ExamAdmin', 'DeputyCOE', 'Student'])(
    'denies %s on every sensitive route',
    async (role) => {
      for (const path of [
        `/${id}/file`,
        `/${id}/versions`,
        `/${id}/versions/${version}/review-file`,
      ])
        await request(app.getHttpServer())
          .get(base + path)
          .set('x-test-role', role)
          .expect(403);
      await request(app.getHttpServer())
        .post(base)
        .set('x-test-role', role)
        .send({ exam_schedule_id: id })
        .expect(403);
      await request(app.getHttpServer())
        .post(`${base}/${id}/status`)
        .set('x-test-role', role)
        .send({ status: 'PRINT_AUTHORIZED' })
        .expect(403);
      await request(app.getHttpServer())
        .post(`${base}/${id}/file`)
        .set('x-test-role', role)
        .attach('file', Buffer.from('%PDF-test'), {
          filename: 'paper.pdf',
          contentType: 'application/pdf',
        })
        .expect(403);
      expect(files.upload).not.toHaveBeenCalled();
      expect(files.download).not.toHaveBeenCalled();
      expect(operations.updateQuestionPaperStatus).not.toHaveBeenCalled();
    },
  );
  it('rejects unauthenticated and missing-tenant requests before service access', async () => {
    await request(app.getHttpServer()).get(`${base}/${id}/file`).expect(401);
    await request(app.getHttpServer())
      .get(`${base}/${id}/file`)
      .set('x-test-role', 'ExamCell')
      .set('x-no-tenant', '1')
      .expect(401);
    expect(files.download).not.toHaveBeenCalled();
  });
  it('forwards only authenticated tenant, actor and active role', async () => {
    await request(app.getHttpServer())
      .post(`${base}/${id}/status`)
      .set('x-test-role', 'ExamCell')
      .send({ status: 'REJECTED', reason: 'Needs correction' })
      .expect(201);
    expect(operations.updateQuestionPaperStatus).toHaveBeenCalledWith(
      tenant,
      id,
      actor,
      'REJECTED',
      'ExamCell',
      'Needs correction',
    );
    await request(app.getHttpServer())
      .post(base)
      .set('x-test-role', 'ExamCell')
      .send({ exam_schedule_id: id, tenant_id: 'forged' })
      .expect(400);
    expect(operations.createQuestionPaperRecord).not.toHaveBeenCalled();
  });
  it('validates status names, UUIDs, registration input and upload metadata', async () => {
    await request(app.getHttpServer())
      .post(`${base}/${id}/status`)
      .set('x-test-role', 'ExamCell')
      .send({ status: 'PUBLISHED' })
      .expect(400);
    await request(app.getHttpServer())
      .get(`${base}/bad-id/file`)
      .set('x-test-role', 'ExamCell')
      .expect(400);
    await request(app.getHttpServer())
      .post(base)
      .set('x-test-role', 'ExamCell')
      .send({ subject_id: 1 })
      .expect(400);
    await request(app.getHttpServer())
      .post(`${base}/${id}/file`)
      .set('x-test-role', 'ExamCell')
      .field('storage_path', '/uploads/forged.pdf')
      .attach('file', Buffer.from('%PDF-test'), {
        filename: 'paper.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);
    expect(files.upload).not.toHaveBeenCalled();
  });
  it('passes actual multipart bytes to the authorized workflow', async () => {
    await request(app.getHttpServer())
      .post(`${base}/${id}/file`)
      .set('x-test-role', 'ExamCell')
      .field('reason', 'Corrected diagram')
      .attach('file', Buffer.from('%PDF-test'), {
        filename: 'untrusted-name.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    expect(files.upload).toHaveBeenCalledWith(
      tenant,
      id,
      actor,
      'ExamCell',
      expect.objectContaining({ buffer: Buffer.from('%PDF-test') }),
      expect.objectContaining({ reason: 'Corrected diagram' }),
    );
  });
  it('separates authorized review from print release and forbids caching', async () => {
    const response = await request(app.getHttpServer())
      .get(`${base}/${id}/versions/${version}/review-file`)
      .set('x-test-role', 'ExamCell')
      .expect(200);
    expect(files.download).toHaveBeenLastCalledWith(
      tenant,
      id,
      actor,
      'ExamCell',
      version,
    );
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-disposition']).toContain('attachment');
    await request(app.getHttpServer())
      .get(`${base}/${id}/file`)
      .set('x-test-role', 'SuperAdmin')
      .expect(200);
    expect(files.download).toHaveBeenLastCalledWith(
      tenant,
      id,
      actor,
      'SuperAdmin',
    );
  });
});
