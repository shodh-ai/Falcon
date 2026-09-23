import { ForbiddenException } from '@nestjs/common';
import {
  calculateCycleDueDate,
  monthNameToNumber,
  TasksService,
} from './tasks.service';

describe('IQAC duty distribution cycle', () => {
  it('uses the actual final day for every month', () => {
    expect(calculateCycleDueDate(2027, 2).toISOString()).toBe(
      '2027-02-28T23:59:59.000Z',
    );
    expect(calculateCycleDueDate(2028, 2).toISOString()).toBe(
      '2028-02-29T23:59:59.000Z',
    );
    expect(calculateCycleDueDate(2027, 4).toISOString()).toBe(
      '2027-04-30T23:59:59.000Z',
    );
    expect(calculateCycleDueDate(2027, 12).toISOString()).toBe(
      '2027-12-31T23:59:59.000Z',
    );
  });

  it('rejects invalid month names', () => {
    expect(monthNameToNumber('September')).toBe(9);
    expect(() => monthNameToNumber('NotAMonth')).toThrow('Invalid month');
  });

  it('moves an upload to SUBMITTED, never directly to completed', async () => {
    const assignment: Record<string, any> = {
      assignment_id: 'assignment-1',
      assigned_to: 'submitter-1',
      tenant_id: 'tenant-1',
      status: 'OPEN',
      version: 1,
    };
    const assignmentRepo = {
      findOne: jest.fn().mockResolvedValue(assignment),
      save: jest.fn(async (value) => value),
    };
    const submissionRepo = {
      create: jest.fn((value) => ({ submission_id: 'submission-1', ...value })),
      save: jest.fn(async (value) => value),
    };
    const userRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ user_id: 'submitter-1', tenant_id: 'tenant-1' }),
    };
    const service = new TasksService(
      {} as never,
      assignmentRepo as never,
      submissionRepo as never,
      userRepo as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
      { add: jest.fn() } as never,
      { log: jest.fn() } as never,
    );

    await service.createSubmission(
      'assignment-1',
      { text_input: 'Monthly evidence' },
      'submitter-1',
      'tenant-1',
    );

    expect(assignment.status).toBe('SUBMITTED');
    expect(assignment.completed_at).toBeUndefined();
    expect(assignment.submitted_at).toBeInstanceOf(Date);
  });

  it('enforces independent review and accepts only through reviewer action', async () => {
    const assignment: Record<string, any> = {
      assignment_id: 'assignment-1',
      assigned_to: 'submitter-1',
      tenant_id: 'tenant-1',
      status: 'SUBMITTED',
      version: 1,
      completed_at: null,
    };
    const assignmentRepo = {
      findOne: jest.fn().mockResolvedValue(assignment),
      save: jest.fn(async (value) => value),
    };
    const service = new TasksService(
      {} as never,
      assignmentRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.reviewAssignment('assignment-1', 'ACCEPTED', undefined, {
        userId: 'submitter-1',
        tenantId: 'tenant-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await service.reviewAssignment('assignment-1', 'ACCEPTED', 'Verified', {
      userId: 'reviewer-1',
      tenantId: 'tenant-1',
    });
    expect(assignment.status).toBe('ACCEPTED');
    expect(assignment.reviewed_by).toBe('reviewer-1');
    expect(assignment.completed_at).toBeInstanceOf(Date);
  });

  it('requires an explanation before returning evidence for changes', async () => {
    const assignment: Record<string, any> = {
      assignment_id: 'assignment-2',
      assigned_to: 'submitter-1',
      tenant_id: 'tenant-1',
      status: 'SUBMITTED',
      version: 1,
    };
    const service = new TasksService(
      {} as never,
      {
        findOne: jest.fn().mockResolvedValue(assignment),
        save: jest.fn(),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.reviewAssignment('assignment-2', 'CHANGES_REQUESTED', ' ', {
        userId: 'reviewer-1',
        tenantId: 'tenant-1',
      }),
    ).rejects.toThrow('Reviewer comments are required');
  });
});
