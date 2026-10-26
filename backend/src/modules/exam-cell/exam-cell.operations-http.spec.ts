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

type FixtureUser = { user_id: string; tenant_id?: string; role: string };
type Route = { method: 'get' | 'post'; path: string; body?: object };

// Exercises HTTP routing, real RolesGuard, controller action checks and the
// production ValidationPipe options. Authentication and services are fixtures;
// this suite does not prove JWT verification, database isolation or persistence.
describe('Exam Cell session and exam-day HTTP boundaries', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const actorId = '22222222-2222-4222-8222-222222222222';
  const sessionId = '33333333-3333-4333-8333-333333333333';
  const scheduleId = '44444444-4444-4444-8444-444444444444';
  const studentId = '55555555-5555-4555-8555-555555555555';
  const prefix = '/api/exam-cell';
  const sessionBody = {
    academic_year: '2026-27',
    session_name: 'HTTP boundary fixture',
    cycle_type: 'ODD_SEMESTER',
    semester: 1,
    start_date: '2026-10-21',
    end_date: '2026-10-30',
    status: 'DRAFT',
  };
  const attendanceBody = {
    exam_schedule_id: scheduleId,
    student_user_id: studentId,
    status: 'PRESENT',
  };
  const createRoute: Route = {
    method: 'post',
    path: `${prefix}/sessions`,
    body: sessionBody,
  };
  const statusRoute: Route = {
    method: 'post',
    path: `${prefix}/sessions/${sessionId}/status`,
    body: { status: 'OPEN' },
  };
  const attendanceRoute: Route = {
    method: 'post',
    path: `${prefix}/exam-day/attendance`,
    body: attendanceBody,
  };
  const reads: Route[] = [
    { method: 'get', path: `${prefix}/sessions` },
    {
      method: 'get',
      path: `${prefix}/exam-day/roster?exam_schedule_id=${scheduleId}`,
    },
    {
      method: 'get',
      path: `${prefix}/exam-day/attendance?exam_schedule_id=${scheduleId}`,
    },
  ];
  const writes = [createRoute, statusRoute, attendanceRoute];
  const routes = [...reads, ...writes];
  const fixtures: Record<string, FixtureUser> = {
    examcell: { user_id: actorId, tenant_id: tenantId, role: 'ExamCell' },
    admin: { user_id: actorId, tenant_id: tenantId, role: 'ExamAdmin' },
    deputy: { user_id: actorId, tenant_id: tenantId, role: 'DeputyCOE' },
    superadmin: { user_id: actorId, tenant_id: tenantId, role: 'SuperAdmin' },
    operator: { user_id: actorId, tenant_id: tenantId, role: 'ExamOperator' },
    student: { user_id: studentId, tenant_id: tenantId, role: 'Student' },
    missingTenant: { user_id: actorId, role: 'ExamCell' },
    blankTenant: { user_id: actorId, tenant_id: '   ', role: 'ExamCell' },
  };
  const sessions = {
    listSessions: jest.fn().mockResolvedValue([]),
    createSession: jest
      .fn()
      .mockResolvedValue({ session_id: sessionId, status: 'DRAFT' }),
    updateSessionStatus: jest.fn().mockResolvedValue({ session_id: sessionId }),
  };
  const operations = {
    listExamDayRoster: jest.fn().mockResolvedValue([]),
    listExamDayAttendance: jest.fn().mockResolvedValue([]),
    markExamDayAttendance: jest.fn().mockResolvedValue({ status: 'PRESENT' }),
  };
  let app: INestApplication<App>;

  beforeAll(async () => {
    const fixtureAuthentication: CanActivate = {
      canActivate(context: ExecutionContext) {
        const req = context.switchToHttp().getRequest<{
          headers: Record<string, string | string[] | undefined>;
          user?: FixtureUser;
        }>();
        const fixture = req.headers['x-fixture-user'];
        if (typeof fixture !== 'string' || !fixtures[fixture]) {
          throw new UnauthorizedException('Authentication fixture required');
        }
        req.user = { ...fixtures[fixture] };
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
        { provide: ExamCellSessionsService, useValue: sessions },
        { provide: ExamCellOperationsService, useValue: operations },
        { provide: ExamCellEnterpriseService, useValue: {} },
        { provide: ExamCellDevService, useValue: {} },
        { provide: OfficialTranscriptService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(fixtureAuthentication)
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

  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => {
    if (app) await app.close();
  });

  function issue(route: Route, fixture?: string) {
    const req = request(app.getHttpServer())[route.method](route.path);
    if (fixture) req.set('x-fixture-user', fixture);
    if (route.body) req.send(route.body);
    return req;
  }

  function expectNoServiceCalls() {
    for (const mock of [
      ...Object.values(sessions),
      ...Object.values(operations),
    ]) {
      expect(mock).not.toHaveBeenCalled();
    }
  }

  it.each(routes)(
    'rejects unauthenticated $method $path with 401',
    async (route) => {
      await issue(route).expect(401);
      expectNoServiceCalls();
    },
  );

  it.each(routes)(
    'rejects Student access to $method $path with 403',
    async (route) => {
      await issue(route, 'student').expect(403);
      expectNoServiceCalls();
    },
  );

  it.each(writes)(
    'rejects ExamOperator manage_sessions action at $path',
    async (route) => {
      await issue(route, 'operator').expect(403);
      expectNoServiceCalls();
    },
  );

  it.each(['missingTenant', 'blankTenant'])(
    'rejects %s on every scoped route',
    async (fixture) => {
      for (const route of routes) await issue(route, fixture).expect(403);
      expectNoServiceCalls();
    },
  );

  it.each(['examcell', 'admin', 'deputy', 'superadmin'])(
    'forwards the authenticated actor and tenant for %s writes',
    async (fixture) => {
      await issue(createRoute, fixture).expect(201);
      expect(sessions.createSession).toHaveBeenCalledWith(
        tenantId,
        actorId,
        sessionBody,
      );
      await issue(statusRoute, fixture).expect(201);
      expect(sessions.updateSessionStatus).toHaveBeenCalledWith(
        tenantId,
        sessionId,
        actorId,
        'OPEN',
      );
      await issue(attendanceRoute, fixture).expect(201);
      expect(operations.markExamDayAttendance).toHaveBeenCalledWith(
        tenantId,
        actorId,
        attendanceBody,
      );
    },
  );

  it('keeps read-only ExamOperator access within the authenticated tenant', async () => {
    for (const route of reads) await issue(route, 'operator').expect(200);
    expect(sessions.listSessions).toHaveBeenCalledWith(tenantId);
    expect(operations.listExamDayRoster).toHaveBeenCalledWith(
      tenantId,
      scheduleId,
    );
    expect(operations.listExamDayAttendance).toHaveBeenCalledWith(
      tenantId,
      scheduleId,
    );
  });

  it.each(['OPEN', 'ACTIVE', 'CLOSED', 'ARCHIVED'])(
    'accepts supported %s status input for service transition validation',
    async (status) => {
      await issue({ ...statusRoute, body: { status } }, 'examcell').expect(201);
      expect(sessions.updateSessionStatus).toHaveBeenCalledWith(
        tenantId,
        sessionId,
        actorId,
        status,
      );
    },
  );

  it.each(['PRESENT', 'ABSENT', 'MEDICAL', 'DEBARRED', 'LATE'])(
    'accepts supported %s attendance input',
    async (status) => {
      const body = { ...attendanceBody, status };
      await issue({ ...attendanceRoute, body }, 'examcell').expect(201);
      expect(operations.markExamDayAttendance).toHaveBeenCalledWith(
        tenantId,
        actorId,
        body,
      );
    },
  );

  const invalidRoutes: Route[] = [
    { ...createRoute, body: { ...sessionBody, cycle_type: 'UNKNOWN' } },
    { ...createRoute, body: { ...sessionBody, session_name: '' } },
    { ...createRoute, body: { ...sessionBody, semester: 0 } },
    { ...createRoute, body: { ...sessionBody, status: 'APPROVED' } },
    { ...createRoute, body: { ...sessionBody, tenant_id: 'client-tenant' } },
    { ...statusRoute, path: `${prefix}/sessions/not-a-uuid/status` },
    { ...statusRoute, body: { status: 'PUBLISHED' } },
    { ...statusRoute, body: { status: 'OPEN', actor_user_id: 'client-actor' } },
    {
      ...attendanceRoute,
      body: { ...attendanceBody, exam_schedule_id: 'not-a-uuid' },
    },
    {
      ...attendanceRoute,
      body: { ...attendanceBody, student_user_id: 'not-a-uuid' },
    },
    { ...attendanceRoute, body: { ...attendanceBody, status: 'EXCUSED' } },
    {
      ...attendanceRoute,
      body: { ...attendanceBody, tenant_id: 'client-tenant' },
    },
    { method: 'get', path: `${prefix}/exam-day/roster` },
    {
      method: 'get',
      path: `${prefix}/exam-day/roster?exam_schedule_id=not-a-uuid`,
    },
    { method: 'get', path: `${prefix}/exam-day/attendance` },
    {
      method: 'get',
      path: `${prefix}/exam-day/attendance?exam_schedule_id=not-a-uuid`,
    },
  ];

  it.each(invalidRoutes)(
    'rejects invalid or extra input at $method $path before service calls',
    async (route) => {
      await issue(route, 'examcell').expect(400);
      expectNoServiceCalls();
    },
  );
});
