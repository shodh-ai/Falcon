import {
  CanActivate,
  ExecutionContext,
  INestApplication,
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
import { ExamDayScriptsService } from './exam-day-scripts.service';

// Real HTTP controller/DTO/action checks and RolesGuard; fixture auth/services.
// PostgreSQL persistence, locks and audit rollback are tested in the PG suite.
describe('exam-day HTTP authorization and validation', () => {
  const tenant = '11111111-1111-4111-8111-111111111111';
  const actor = '22222222-2222-4222-8222-222222222222';
  const schedule = '33333333-3333-4333-8333-333333333333';
  const student = '44444444-4444-4444-8444-444444444444';
  const record = '55555555-5555-4555-8555-555555555555';
  const prefix = '/api/exam-cell';
  const scriptBody = {
    exam_schedule_id: schedule,
    student_user_id: student,
    sheet_number: 'ACTUAL-BOOKLET',
    collect: true,
  };
  const missingBody = {
    exam_schedule_id: schedule,
    student_user_id: student,
    reason: 'Not found after physical count',
  };
  const incidentBody = {
    exam_schedule_id: schedule,
    student_user_id: student,
    request_id: record,
    description: 'Reported unauthorized material',
  };
  type Route = {
    method: 'get' | 'post';
    path: string;
    body?: object;
    action?: 'manage_sessions' | 'approve_ufm';
  };
  const writes: Route[] = [
    {
      method: 'post',
      path: `${prefix}/answer-sheets`,
      body: scriptBody,
      action: 'manage_sessions',
    },
    {
      method: 'post',
      path: `${prefix}/answer-sheets/${record}/status`,
      body: { status: 'COLLECTED' },
      action: 'manage_sessions',
    },
    {
      method: 'post',
      path: `${prefix}/exam-day/scripts/missing`,
      body: missingBody,
      action: 'manage_sessions',
    },
    {
      method: 'post',
      path: `${prefix}/exam-day/scripts/${record}/resolve`,
      body: {
        resolution: 'REPORTED_IN_ERROR',
        reason: 'Candidate was actually absent',
      },
      action: 'manage_sessions',
    },
    {
      method: 'post',
      path: `${prefix}/exam-day/ufm`,
      body: incidentBody,
      action: 'approve_ufm',
    },
    {
      method: 'post',
      path: `${prefix}/exam-day/ufm/${record}/status`,
      body: { status: 'UNDER_REVIEW', reason: 'Evidence being reviewed' },
      action: 'approve_ufm',
    },
    {
      method: 'post',
      path: `${prefix}/answer-sheets/${record}/correct-receipt`,
      body: { reason: 'Wrong receipt selected for candidate' },
      action: 'manage_sessions',
    },
  ];
  const reads: Route[] = [
    {
      method: 'get',
      path: `${prefix}/exam-day/scripts?exam_schedule_id=${schedule}`,
    },
    {
      method: 'get',
      path: `${prefix}/exam-day/ufm?exam_schedule_id=${schedule}`,
    },
    {
      method: 'get',
      path: `${prefix}/answer-sheets?exam_schedule_id=${schedule}`,
    },
  ];
  const scripts = {
    reconciliation: jest.fn().mockResolvedValue({}),
    reportMissing: jest.fn().mockResolvedValue({}),
    resolveMissing: jest.fn().mockResolvedValue({}),
    correctReceipt: jest.fn().mockResolvedValue({}),
    listIncidents: jest.fn().mockResolvedValue([]),
    reportIncident: jest.fn().mockResolvedValue({}),
    reviewIncident: jest.fn().mockResolvedValue({}),
  };
  const enterprise = {
    listAnswerSheets: jest.fn().mockResolvedValue([]),
    createAnswerSheet: jest.fn().mockResolvedValue({}),
    updateAnswerSheetStatus: jest.fn().mockResolvedValue({}),
  };
  const operations = { listTodayExams: jest.fn().mockResolvedValue([]) };
  let app: INestApplication<App>;
  beforeAll(async () => {
    const auth: CanActivate = {
      canActivate(context: ExecutionContext) {
        const req = context
          .switchToHttp()
          .getRequest<{ headers: Record<string, string>; user?: object }>();
        const role = req.headers['x-role'];
        if (!role) throw new UnauthorizedException();
        req.user = {
          user_id: actor,
          tenant_id: req.headers['x-missing-tenant'] ? undefined : tenant,
          role,
          primaryRole: role,
          roles: role === 'ExamOperator' ? [role, 'ExamCell'] : [role],
        };
        return true;
      },
    };
    const module = await Test.createTestingModule({
      controllers: [ExamCellController],
      providers: [
        RolesGuard,
        { provide: ExamCellService, useValue: {} },
        { provide: ResultControlService, useValue: {} },
        { provide: SemesterResultsService, useValue: {} },
        { provide: ExamCellAuditService, useValue: {} },
        { provide: ExamCellSessionsService, useValue: {} },
        { provide: ExamCellOperationsService, useValue: operations },
        { provide: ExamCellEnterpriseService, useValue: enterprise },
        { provide: ExamCellDevService, useValue: {} },
        { provide: OfficialTranscriptService, useValue: {} },
        { provide: ExamDayScriptsService, useValue: scripts },
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
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    jest.clearAllMocks();
  });
  function issue(route: Route, role?: string) {
    const req = request(app.getHttpServer())[route.method](route.path);
    if (role) req.set('x-role', role);
    if (route.body) req.send(route.body);
    return req;
  }
  function noCalls() {
    for (const mock of [
      ...Object.values(scripts),
      ...Object.values(enterprise),
      ...Object.values(operations),
    ])
      expect(mock).not.toHaveBeenCalled();
  }

  it.each([...reads, ...writes])(
    'denies anonymous $method $path',
    async (route) => {
      await issue(route).expect(401);
      noCalls();
    },
  );

  it.each([...reads, ...writes])(
    'denies Student access to $method $path',
    async (route) => {
      await issue(route, 'Student').expect(403);
      noCalls();
    },
  );
  it.each(writes)(
    'denies active ExamOperator $path even with ExamCell also assigned',
    async (route) => {
      await issue(route, 'ExamOperator').expect(403);
      noCalls();
    },
  );
  it.each([...reads, ...writes])(
    'denies missing tenant on $method $path',
    async (route) => {
      await issue(route, 'ExamCell').set('x-missing-tenant', '1').expect(403);
      noCalls();
    },
  );
  it.each(reads)('retains ExamOperator read access to $path', async (route) => {
    await issue(route, 'ExamOperator').expect(200);
  });
  it.each(writes.filter((r) => r.action === 'approve_ufm'))(
    'denies ExamAdmin UFM action at $path',
    async (route) => {
      await issue(route, 'ExamAdmin').expect(403);
      noCalls();
    },
  );

  it('forwards only authenticated tenant/actor/active role and validated collection input', async () => {
    await issue(writes[0], 'ExamCell').expect(201);
    expect(enterprise.createAnswerSheet).toHaveBeenCalledWith(
      tenant,
      actor,
      scriptBody,
      'ExamCell',
    );
    await issue(writes[2], 'ExamAdmin').expect(201);
    expect(scripts.reportMissing).toHaveBeenCalledWith(
      tenant,
      actor,
      missingBody,
      'ExamAdmin',
    );
    await issue(writes[4], 'DeputyCOE').expect(201);
    expect(scripts.reportIncident).toHaveBeenCalledWith(
      tenant,
      actor,
      incidentBody,
      'DeputyCOE',
    );
  });

  const invalid: Route[] = [
    { ...writes[0], body: { sheet_number: 'UNLINKED' } },
    { ...writes[0], body: { ...scriptBody, sheet_number: '   ' } },
    { ...writes[0], body: { ...scriptBody, collect: 'true' } },
    { ...writes[0], body: { ...scriptBody, tenant_id: tenant } },
    { ...writes[0], body: { ...scriptBody, collected_by: student } },
    { ...writes[0], body: { ...scriptBody, student_user_id: 'not-a-uuid' } },
    { ...writes[1], body: { status: 'MISSING' } },
    { ...writes[2], body: { ...missingBody, reason: '  ' } },
    { ...writes[3], body: { resolution: 'FOUND', reason: '' } },
    { ...writes[4], body: { ...incidentBody, penalty_applied: 'Cancel exam' } },
    { ...writes[4], body: { ...incidentBody, reported_by: student } },
    { ...writes[5], body: { status: 'OPEN', reason: 'Force reopen' } },
    {
      method: 'get',
      path: `${prefix}/exam-day/scripts?exam_schedule_id=invalid`,
    },
    { method: 'get', path: `${prefix}/exam-day/ufm` },
    { method: 'get', path: `${prefix}/exam-day/today?date=2026-02-31` },
  ];
  it.each(invalid)(
    'rejects invalid/forged input on $method $path',
    async (route) => {
      await issue(route, 'ExamCell').expect(400);
      noCalls();
    },
  );
  it('accepts a real selected examination date', async () => {
    await issue(
      { method: 'get', path: `${prefix}/exam-day/today?date=2026-10-23` },
      'ExamCell',
    ).expect(200);
    expect(operations.listTodayExams).toHaveBeenCalledWith(
      tenant,
      '2026-10-23',
    );
  });
});
