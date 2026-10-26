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
import { DeanIntelligenceController } from '../academics/dean-intelligence.controller';
import { DeanIntelligenceService } from '../academics/dean-intelligence.service';
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

// Real HTTP routing, RolesGuard and controller action/tenant checks; JWT
// verification and downstream services are fixtures, not a live database test.
describe('Result approval and declaration HTTP security boundaries', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const actorId = '22222222-2222-4222-8222-222222222222';
  const sessionId = '33333333-3333-4333-8333-333333333333';
  const requestId = '44444444-4444-4444-8444-444444444444';
  const deanPrefix = '/api/academics/dean/intelligence/result-approvals';
  const examPrefix = '/api/exam-cell';
  const approvalReads: Route[] = [
    { method: 'get', path: deanPrefix },
    { method: 'get', path: `${deanPrefix}/session/${sessionId}/history` },
  ];
  const decisionRoute: Route = {
    method: 'post',
    path: `${deanPrefix}/${requestId}/decision`,
    body: { decision: 'APPROVED', comment: 'Reviewed' },
  };
  const approvalRoutes = [...approvalReads, decisionRoute];
  const declarationRoutes: Route[] = [
    {
      method: 'post',
      path: `${examPrefix}/result-control/sessions/${sessionId}/declare`,
      body: { declaration_note: 'Reviewed result batch' },
    },
    {
      method: 'post',
      path: `${examPrefix}/results/publish`,
      body: {
        course_id: 'course-fixture',
        exam_type: 'END_TERM',
        batch_semester: 4,
      },
    },
  ];
  const routes = [...approvalRoutes, ...declarationRoutes];
  const fixtures: Record<string, FixtureUser> = {
    dean: { user_id: actorId, tenant_id: tenantId, role: 'Dean' },
    superadmin: { user_id: actorId, tenant_id: tenantId, role: 'SuperAdmin' },
    examcell: { user_id: actorId, tenant_id: tenantId, role: 'ExamCell' },
    deputy: { user_id: actorId, tenant_id: tenantId, role: 'DeputyCOE' },
    admin: { user_id: actorId, tenant_id: tenantId, role: 'ExamAdmin' },
    operator: { user_id: actorId, tenant_id: tenantId, role: 'ExamOperator' },
    faculty: { user_id: actorId, tenant_id: tenantId, role: 'Faculty' },
    student: { user_id: actorId, tenant_id: tenantId, role: 'Student' },
    missingDeanTenant: { user_id: actorId, role: 'Dean' },
    blankDeanTenant: { user_id: actorId, tenant_id: '   ', role: 'Dean' },
    missingExamTenant: { user_id: actorId, role: 'ExamCell' },
    blankExamTenant: { user_id: actorId, tenant_id: '   ', role: 'ExamCell' },
  };
  const intelligence = {
    listResultApprovals: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    decideResultApproval: jest.fn().mockResolvedValue({ status: 'APPROVED' }),
    getResultApprovalHistory: jest.fn().mockResolvedValue([]),
  };
  const resultControl = {
    declareSession: jest.fn().mockResolvedValue({ declared: 1 }),
  };
  const examCell = {
    publishResults: jest.fn().mockResolvedValue({ declared: 1 }),
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
      controllers: [ExamCellController, DeanIntelligenceController],
      providers: [
        RolesGuard,
        { provide: DeanIntelligenceService, useValue: intelligence },
        { provide: ResultControlService, useValue: resultControl },
        { provide: ExamCellService, useValue: examCell },
        { provide: SemesterResultsService, useValue: {} },
        { provide: ExamCellAuditService, useValue: {} },
        { provide: ExamCellSessionsService, useValue: {} },
        { provide: ExamCellOperationsService, useValue: {} },
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
      ...Object.values(intelligence),
      ...Object.values(resultControl),
      ...Object.values(examCell),
    ]) {
      expect(mock).not.toHaveBeenCalled();
    }
  }

  it.each(routes)('requires authentication at $method $path', async (route) => {
    await issue(route).expect(401);
    expectNoServiceCalls();
  });

  it.each(['examcell', 'deputy', 'faculty', 'student'])(
    'rejects %s access to Dean approval actions',
    async (fixture) => {
      for (const route of approvalRoutes)
        await issue(route, fixture).expect(403);
      expectNoServiceCalls();
    },
  );

  it.each(['missingDeanTenant', 'blankDeanTenant'])(
    'rejects %s rather than selecting a default tenant',
    async (fixture) => {
      for (const route of approvalRoutes)
        await issue(route, fixture).expect(403);
      expectNoServiceCalls();
    },
  );

  it.each(['missingExamTenant', 'blankExamTenant'])(
    'rejects %s on both publication routes',
    async (fixture) => {
      for (const route of declarationRoutes)
        await issue(route, fixture).expect(403);
      expectNoServiceCalls();
    },
  );

  it.each(['dean', 'superadmin'])(
    'preserves %s approval access with the authenticated tenant and actor',
    async (fixture) => {
      for (const route of approvalReads)
        await issue(route, fixture).expect(200);
      await issue(decisionRoute, fixture).expect(201);
      expect(intelligence.listResultApprovals).toHaveBeenCalledWith(
        tenantId,
        actorId,
        {},
      );
      expect(intelligence.getResultApprovalHistory).toHaveBeenCalledWith(
        tenantId,
        actorId,
        sessionId,
        fixtures[fixture].role,
      );
      expect(intelligence.decideResultApproval).toHaveBeenCalledWith(
        tenantId,
        actorId,
        requestId,
        'APPROVED',
        'Reviewed',
        { role: fixtures[fixture].role },
      );
    },
  );

  it('does not authorize a client-supplied tenant or approver identity', async () => {
    await issue(
      {
        ...decisionRoute,
        body: {
          ...decisionRoute.body,
          tenant_id: 'other-tenant',
          decided_by: 'other-user',
          role: 'SuperAdmin',
        },
      },
      'dean',
    ).expect(201);
    expect(intelligence.decideResultApproval).toHaveBeenCalledWith(
      tenantId,
      actorId,
      requestId,
      'APPROVED',
      'Reviewed',
      { role: 'Dean' },
    );
  });

  it.each(['student', 'faculty', 'dean', 'admin', 'operator'])(
    'rejects %s declaration through both publication routes',
    async (fixture) => {
      for (const route of declarationRoutes)
        await issue(route, fixture).expect(403);
      expectNoServiceCalls();
    },
  );

  it.each(['examcell', 'deputy', 'superadmin'])(
    'preserves %s publication access and authenticated scope',
    async (fixture) => {
      for (const route of declarationRoutes)
        await issue(route, fixture).expect(201);
      expect(resultControl.declareSession).toHaveBeenCalledWith(
        tenantId,
        sessionId,
        actorId,
        declarationRoutes[0].body,
      );
      expect(examCell.publishResults).toHaveBeenCalledWith(
        tenantId,
        declarationRoutes[1].body,
        actorId,
      );
    },
  );
});
