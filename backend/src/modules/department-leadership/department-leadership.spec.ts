import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { DepartmentLeadershipService } from './department-leadership.service';
import { officeEnabled, reportingKind } from './leadership.types';
import { configuredReportingOfficer } from './reporting-officer';
import { DataSource } from 'typeorm';
import { CampusScopeService } from '../../common/campus-scope/campus-scope.service';
const actor = { tenant_id: 'tenant', user_id: 'admin', role: 'SuperAdmin' };
function service(query: jest.Mock) {
  return new DepartmentLeadershipService(
    {
      query,
      transaction: async (_level: string, fn: any) => fn({ query }),
    } as unknown as DataSource,
    { resolveCampusIds: async () => null } as unknown as CampusScopeService,
  );
}
describe('department leadership isolation', () => {
  test.each([
    ['HOD_ONLY', true, false, 'HOD'],
    ['PRINCIPAL_ONLY', false, true, 'PRINCIPAL'],
    ['PRINCIPAL_HOD', true, true, 'PRINCIPAL'],
  ] as const)(
    '%s supports exactly the selected offices',
    (shape, hod, principal, head) => {
      expect(officeEnabled(shape, 'HOD')).toBe(hod);
      expect(officeEnabled(shape, 'PRINCIPAL')).toBe(principal);
      expect(reportingKind(shape)).toBe(head);
    },
  );
  test('refuses departments outside tenant/campus before mutation', async () => {
    const q = jest.fn().mockResolvedValue([]);
    await expect(
      service(q).configure(actor, 43, { structure: 'HOD_ONLY' }, 0),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(q.mock.calls.some(([sql]) => sql.includes('INSERT'))).toBe(false);
  });
  test('stale configuration does not overwrite a newer revision', async () => {
    const q = jest
      .fn()
      .mockResolvedValueOnce([{ dept_id: 43 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ revision: 2 }]);
    await expect(
      service(q).configure(actor, 43, { structure: 'HOD_ONLY' }, 1),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  test('cannot assign disabled HOD in Principal-only department', async () => {
    const q = jest
      .fn()
      .mockResolvedValueOnce([{ dept_id: 43 }])
      .mockResolvedValueOnce([{ revision: 1, structure: 'PRINCIPAL_ONLY' }]);
    await expect(
      service(q).appoint(actor, 43, 'HOD', 'hod@example.edu', 'person', 1),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  test('personal-email collision prevents office takeover', async () => {
    const q = jest
      .fn()
      .mockResolvedValueOnce([{ dept_id: 43 }])
      .mockResolvedValueOnce([{ revision: 1, structure: 'HOD_ONLY' }])
      .mockResolvedValueOnce([{ user_id: 'other' }]);
    await expect(
      service(q).appoint(actor, 43, 'HOD', 'someone@example.edu', 'person', 1),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  test('inactive/wrong-department/student holder is rejected', async () => {
    const q = jest
      .fn()
      .mockResolvedValueOnce([{ dept_id: 43 }])
      .mockResolvedValueOnce([{ revision: 1, structure: 'HOD_ONLY' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    await expect(
      service(q).appoint(actor, 43, 'HOD', 'hod@example.edu', 'person', 1),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  test('replacement ends old appointment, invalidates both people, audits without touching passwords', async () => {
    const q = jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT d.dept_id')) return [{ dept_id: 43 }];
      if (sql.includes('SELECT * FROM department_leadership'))
        return [
          { revision: 1, structure: 'HOD_ONLY', higher_officer_id: null },
        ];
      if (sql.includes('SELECT user_id FROM users WHERE tenant_id')) return [];
      if (sql.includes('SELECT u.user_id FROM users u'))
        return [{ user_id: 'new' }];
      if (sql.includes('RETURNING office_id')) return [{ office_id: 'office' }];
      if (sql.includes('SELECT user_id FROM department_office_appointments'))
        return [{ user_id: 'old' }];
      if (sql.includes('SELECT a.user_id FROM department_offices'))
        return [{ user_id: 'new' }];
      return [];
    });
    await expect(
      service(q).appoint(actor, 43, 'HOD', 'HOD@EXAMPLE.EDU', 'new', 1),
    ).resolves.toEqual({ success: true, revision: 2 });
    const revision = q.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO department_office_session_revisions'),
    );
    expect(revision?.[1]).toEqual(['tenant', ['old', 'new']]);
    expect(q.mock.calls.some(([sql]) => sql.includes('password_hash'))).toBe(
      false,
    );
    expect(
      q.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO department_leadership_events'),
      ),
    ).toBe(true);
  });
  test('cycle blocks reporting projection', async () => {
    const q = jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT * FROM department_leadership'))
        return [{ structure: 'PRINCIPAL_HOD', higher_officer_id: 'higher' }];
      if (sql.includes('SELECT a.user_id')) return [{ user_id: 'principal' }];
      if (sql.includes('WITH RECURSIVE')) return [{ exists: 1 }];
      return [];
    });
    await expect(
      (service(q) as any).projectReporting({ query: q }, 'tenant', 43),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(q.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });
});
describe('configured direct reporting', () => {
  test('unmanaged departments retain legacy resolution', async () => {
    expect(await configuredReportingOfficer(async () => [], 't', 'u')).toEqual({
      configured: false,
      officer: null,
    });
  });
  test('Principal directly replaces HOD reporting, without a second HOD stage', async () => {
    expect(
      await configuredReportingOfficer(
        async () => [{ structure: 'PRINCIPAL_HOD', head_user_id: 'principal' }],
        't',
        'faculty',
      ),
    ).toEqual({ configured: true, officer: 'principal' });
  });
  test('head routes to explicit higher reporting officer', async () => {
    expect(
      await configuredReportingOfficer(
        async () => [
          {
            structure: 'PRINCIPAL_ONLY',
            head_user_id: 'principal',
            higher_officer_id: 'higher',
          },
        ],
        't',
        'principal',
      ),
    ).toEqual({ configured: true, officer: 'higher' });
  });
  test.each([null, 'principal'])(
    'missing/self higher officer %s blocks head submission',
    async (higher) => {
      await expect(
        configuredReportingOfficer(
          async () => [
            {
              structure: 'PRINCIPAL_HOD',
              head_user_id: 'principal',
              higher_officer_id: higher,
            },
          ],
          't',
          'principal',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
  test('vacant Principal does not fall through to HOD or HR', async () => {
    await expect(
      configuredReportingOfficer(
        async () => [{ structure: 'PRINCIPAL_HOD', head_user_id: null }],
        't',
        'faculty',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
