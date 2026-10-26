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
import { ResultControlService } from './result-control.service';
import { SemesterResultsService } from './semester-results.service';
import { ExamCellAuditService } from './exam-cell-audit.service';
import { ExamCellSessionsService } from './exam-cell-sessions.service';
import { ExamCellOperationsService } from './exam-cell-operations.service';
import { ExamCellEnterpriseService } from './exam-cell-enterprise.service';
import { ExamCellDevService } from './exam-cell-dev.service';
import { OfficialTranscriptService } from './official-transcript.service';

describe('Dashboard strict audit reads', () => {
  it('requests only the five newest tenant-scoped events with deterministic ordering', async () => {
    const events = [{ audit_id: 'event-a', actor_name: 'Officer' }];
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]]>()
      .mockResolvedValueOnce([{ total: 6 }])
      .mockResolvedValueOnce(events);
    const audit = new ExamCellAuditService({ query } as never);

    await expect(
      audit.listRecent('tenant-a', 5, { strict: true }),
    ).resolves.toEqual(events);

    expect(query.mock.calls[0][1]).toEqual(['tenant-a']);
    expect(query.mock.calls[1][1]).toEqual(['tenant-a', 5, 0]);
    expect(query.mock.calls[1][0]).toContain('a.tenant_id = $1');
    expect(query.mock.calls[1][0]).toContain('u.tenant_id = a.tenant_id');
    expect(query.mock.calls[1][0]).toContain(
      'ORDER BY a.created_at DESC, a.audit_id DESC',
    );
    expect(query.mock.calls.every(([sql]) => /^\s*SELECT\b/.test(sql))).toBe(
      true,
    );
  });

  it('preserves genuine empty audit data', async () => {
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]]>()
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);
    const audit = new ExamCellAuditService({ query } as never);

    await expect(
      audit.listRecent('tenant-a', 5, { strict: true }),
    ).resolves.toEqual([]);
  });

  it.each(['count', 'events'])(
    'propagates an unavailable %s query in strict mode',
    async (stage) => {
      const query = jest.fn<Promise<unknown[]>, [string, unknown[]]>();
      if (stage === 'events') query.mockResolvedValueOnce([{ total: 1 }]);
      query.mockRejectedValueOnce(new Error('database unavailable'));
      const audit = new ExamCellAuditService({ query } as never);

      await expect(
        audit.listRecent('tenant-a', 5, { strict: true }),
      ).rejects.toThrow('database unavailable');
    },
  );

  it('preserves established best-effort behavior for other audit readers', async () => {
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]]>()
      .mockRejectedValue(new Error('database unavailable'));
    const audit = new ExamCellAuditService({ query } as never);

    await expect(audit.listRecent('tenant-a')).resolves.toEqual([]);
  });
});

type FixtureUser = {
  user_id: string;
  tenant_id?: string;
  role: string;
  primaryRole?: string;
};

// Uses the actual RolesGuard and controller action checks. JWT verification and
// database services are fixtures; this is not a live authentication/DB test.
describe('Dashboard HTTP authorization and audit contract', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const actorId = '22222222-2222-4222-8222-222222222222';
  const fixtures: Record<string, FixtureUser> = {
    examcell: { user_id: actorId, tenant_id: tenantId, role: 'ExamCell' },
    superadmin: { user_id: actorId, tenant_id: tenantId, role: 'SuperAdmin' },
    deputy: { user_id: actorId, tenant_id: tenantId, role: 'DeputyCOE' },
    admin: { user_id: actorId, tenant_id: tenantId, role: 'ExamAdmin' },
    operator: { user_id: actorId, tenant_id: tenantId, role: 'ExamOperator' },
    student: { user_id: actorId, tenant_id: tenantId, role: 'Student' },
    inactivePrivilege: {
      user_id: actorId,
      tenant_id: tenantId,
      role: 'ExamCell',
      primaryRole: 'Student',
    },
    missingTenant: { user_id: actorId, role: 'ExamCell' },
    blankTenant: { user_id: actorId, tenant_id: '   ', role: 'ExamCell' },
  };
  const statistics = { todays_exams: 2, pending_results: 1 };
  const examCell = { dashboard: jest.fn() };
  const audit = { listRecent: jest.fn() };
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
        { provide: ExamCellService, useValue: examCell },
        { provide: ResultControlService, useValue: {} },
        { provide: SemesterResultsService, useValue: {} },
        { provide: ExamCellAuditService, useValue: audit },
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
    app.useLogger(false);
    await app.init();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    examCell.dashboard.mockResolvedValue(statistics);
    audit.listRecent.mockResolvedValue([]);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  function issue(fixture?: string, query = '') {
    const req = request(app.getHttpServer()).get(
      `/api/exam-cell/dashboard${query}`,
    );
    return fixture ? req.set('x-fixture-user', fixture) : req;
  }

  it.each(['examcell', 'superadmin', 'deputy', 'admin', 'operator'])(
    'allows the existing %s dashboard role using only authenticated tenant scope',
    async (fixture) => {
      const response = await issue(
        fixture,
        '?tenant_id=forged-tenant&student_user_id=forged-student',
      ).expect(200);

      expect(response.body).toEqual({ ...statistics, recent_activity: [] });
      expect(examCell.dashboard).toHaveBeenCalledWith(tenantId);
      expect(audit.listRecent).toHaveBeenCalledWith(tenantId, 5, {
        strict: true,
      });
    },
  );

  it('rejects an unauthenticated dashboard request', async () => {
    await issue().expect(401);
    expect(examCell.dashboard).not.toHaveBeenCalled();
    expect(audit.listRecent).not.toHaveBeenCalled();
  });

  it.each(['student', 'inactivePrivilege', 'missingTenant', 'blankTenant'])(
    'rejects %s before loading tenant data',
    async (fixture) => {
      await issue(fixture).expect(403);
      expect(examCell.dashboard).not.toHaveBeenCalled();
      expect(audit.listRecent).not.toHaveBeenCalled();
    },
  );

  it('projects safe audit fields without returning sensitive payloads or IP addresses', async () => {
    const event = {
      audit_id: 'event-a',
      action: 'RESULT_DECLARED',
      resource_type: 'exam_result_session',
      created_at: '2026-10-24T10:00:00.000Z',
      actor_name: 'Examination Officer',
    };
    audit.listRecent.mockResolvedValue([
      {
        ...event,
        resource_id: 'private-resource',
        old_value: { student: 'private' },
        new_value: { marks: 'private' },
        ip_address: '127.0.0.1',
      },
    ]);

    const response = await issue('examcell').expect(200);

    expect(response.body).toEqual({
      ...statistics,
      recent_activity: [event],
    });
  });

  it('reports audit failure separately without inventing an empty audit or hiding summary data', async () => {
    audit.listRecent.mockRejectedValue(
      new Error('database host and sensitive SQL diagnostics'),
    );

    const response = await issue('examcell').expect(200);

    expect(response.body).toEqual({
      ...statistics,
      recent_activity: null,
      recent_activity_error: 'Recent audit activity is unavailable.',
    });
    expect(JSON.stringify(response.body)).not.toContain('sensitive SQL');
  });

  it('does not return fake statistics when the summary source fails', async () => {
    examCell.dashboard.mockRejectedValue(new Error('summary unavailable'));

    await issue('examcell').expect(500);
  });
});
