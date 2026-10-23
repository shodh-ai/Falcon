import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TasksService } from './tasks.service';

describe('Faculty IQAC evidence submission states', () => {
  function setup(status: string) {
    const assignment = { assignment_id: 'task-1', assigned_to: 'faculty-1', tenant_id: 'tenant-1', status, version: 1 };
    const assignmentRepo = { findOne: jest.fn().mockResolvedValue(assignment), save: jest.fn(async value => value) };
    const submissionRepo = { create: jest.fn(value => value), save: jest.fn(async value => ({ submission_id: 'submission-1', ...value })) };
    const userRepo = { findOne: jest.fn().mockResolvedValue({ user_id: 'faculty-1', tenant_id: 'tenant-1', is_active: true }) };
    const queue = { add: jest.fn() };
    const audit = { log: jest.fn() };
    const service = new TasksService({} as never, assignmentRepo as never, submissionRepo as never, userRepo as never,
      { get: jest.fn() } as never, queue as never, audit as never);
    const submit = () => service.createSubmission('task-1', { text_input: 'Evidence' }, 'faculty-1', 'tenant-1');
    return { assignment, assignmentRepo, submissionRepo, userRepo, queue, audit, submit };
  }

  it.each(['ACCEPTED', 'CLOSED', 'WAIVED', 'CANCELLED', 'PENDING_HOD_APPROVAL', 'PENDING_IQAC_REVIEW', 'UNDER_REVIEW', 'SUBMITTED'])(
    'does not reopen or replace reviewer decisions for a %s task', async status => {
      const { assignment, assignmentRepo, submissionRepo, queue, audit, submit } = setup(status);
      await expect(submit()).rejects.toBeInstanceOf(BadRequestException);
      expect(assignment.status).toBe(status);
      expect(assignmentRepo.save).not.toHaveBeenCalled();
      expect(submissionRepo.create).not.toHaveBeenCalled();
      expect(submissionRepo.save).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    },
  );

  it.each(['OPEN', 'Pending', 'OVERDUE', 'CHANGES_REQUESTED'])(
    'allows evidence for a %s task and routes it through HOD review', async status => {
      const { assignment, assignmentRepo, submissionRepo, audit, submit } = setup(status);
      await expect(submit()).resolves.toMatchObject({ submission_id: 'submission-1' });
      expect(assignment.status).toBe('PENDING_HOD_APPROVAL');
      expect(assignmentRepo.findOne).toHaveBeenCalledWith({ where: { assignment_id: 'task-1', tenant_id: 'tenant-1' } });
      expect(submissionRepo.save).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-1', userId: 'faculty-1' }));
    },
  );

  it.each([null, { tenant_id: 'other-tenant', is_active: true }, { tenant_id: 'tenant-1', is_active: false }])(
    'requires an active matching tenant before persisting evidence (%p)', async user => {
      const { userRepo, assignmentRepo, submissionRepo, submit } = setup('OPEN');
      userRepo.findOne.mockResolvedValue(user);
      await expect(submit()).rejects.toBeInstanceOf(ForbiddenException);
      expect(assignmentRepo.save).not.toHaveBeenCalled();
      expect(submissionRepo.save).not.toHaveBeenCalled();
    },
  );

  it('rejects evidence for another faculty assignment before accessing the user or persisting data', async () => {
    const { assignment, userRepo, submissionRepo, submit } = setup('OPEN');
    assignment.assigned_to = 'other-faculty';
    await expect(submit()).rejects.toBeInstanceOf(ForbiddenException);
    expect(userRepo.findOne).not.toHaveBeenCalled();
    expect(submissionRepo.save).not.toHaveBeenCalled();
  });
});
