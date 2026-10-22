import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ExamCellController } from './exam-cell.controller';
import { ExamCellEnterpriseService } from './exam-cell-enterprise.service';
import { OfficialTranscriptService } from './official-transcript.service';
import { AttendancePolicyController } from '../attendance-policy/attendance-policy.controller';
import {
  assertExamCellAction,
  canExamCellAction,
  examCellRolesFromUser,
} from './exam-cell-rbac.util';

describe('Examination Cell security boundaries', () => {
  afterEach(() => {
    delete process.env.FALCON_EXAM_CELL_DEV_MODE;
    process.env.NODE_ENV = 'test';
  });

  it('honours every trusted role when authorizing an action', () => {
    const roles = examCellRolesFromUser({ roles: ['Faculty', 'ExamAdmin'] });
    expect(roles).toEqual(['Faculty', 'ExamAdmin']);
    expect(canExamCellAction(roles, 'manage_schedules')).toBe(true);
    expect(() => assertExamCellAction(roles, 'publish_results')).toThrow(
      'Your role does not have permission',
    );
  });

  it('does not invent a tenant when the JWT has no tenant claim', async () => {
    const controller = new ExamCellController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      controller.dashboard({ user: { user_id: 'user-without-tenant' } }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects attendance-policy dependencies when the JWT has no tenant claim', () => {
    const controller = new AttendancePolicyController({} as never);
    expect(() =>
      controller.approvedExemptions({
        user: { user_id: 'user-without-tenant' },
      }),
    ).toThrow(UnauthorizedException);
  });

  it('keeps database-writing dev endpoints explicitly opt-in', () => {
    const controller = new ExamCellController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    expect(() =>
      controller.devBootstrap({
        user: { user_id: 'u', tenant_id: 't', role: 'ExamCell' },
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects calendar date input before it reaches SQL', async () => {
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]?]>()
      .mockResolvedValue([]);
    const service = new ExamCellEnterpriseService(
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.listCalendarEvents('tenant-a', {
        from: "2026-01-01' OR 1=1 --",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('parameterizes valid calendar schedule bounds', async () => {
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]?]>()
      .mockResolvedValue([]);
    const service = new ExamCellEnterpriseService(
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await service.listCalendarEvents('tenant-a', {
      from: '2026-01-01',
      to: '2026-01-31',
    });
    const scheduleCall = query.mock.calls[1] as [string, unknown[]];
    expect(scheduleCall[0]).not.toContain('2026-01-01');
    expect(scheduleCall[0]).not.toContain('2026-01-31');
    expect(scheduleCall[1]).toEqual(['tenant-a', '2026-01-01', '2026-01-31']);
  });

  it('rejects malformed public transcript codes before querying', async () => {
    const query = jest.fn<Promise<unknown[]>, [string, unknown[]?]>();
    const service = new OfficialTranscriptService(
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.verifyPublic('student-id-or-sql'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });
});
