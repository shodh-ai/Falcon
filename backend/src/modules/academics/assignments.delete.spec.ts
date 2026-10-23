import { ConflictException, NotFoundException } from '@nestjs/common';
import { AssignmentsService } from './assignments.service';

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

describe('Faculty assignment deletion', () => {
  function setup(
    submissionCount: number,
    assignment: Record<string, unknown> | null = {
      assignment_id: 'assignment-1',
      tenant_id: 'tenant-1',
      faculty_user_id: 'faculty-1',
      course_id: 'course-1',
    },
  ) {
    const assignments = {
      findOne: jest.fn().mockResolvedValue(assignment),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const submissions = { count: jest.fn().mockResolvedValue(submissionCount) };
    const target = new AssignmentsService(
      assignments as any,
      submissions as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { target, assignments, submissions };
  }

  it('soft-deletes an unsubmitted assignment in the faculty tenant', async () => {
    const { target, assignments } = setup(0);
    await expect(
      target.deleteFacultyAssignment('faculty-1', 'tenant-1', 'assignment-1'),
    ).resolves.toEqual({ deleted: true, assignment_id: 'assignment-1' });
    expect(assignments.softDelete).toHaveBeenCalledWith({
      tenant_id: 'tenant-1',
      assignment_id: 'assignment-1',
    });
  });

  it('preserves assignments with student submissions', async () => {
    const { target, assignments } = setup(1);
    await expect(
      target.deleteFacultyAssignment('faculty-1', 'tenant-1', 'assignment-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(assignments.softDelete).not.toHaveBeenCalled();
  });

  it('does not expose or delete another faculty assignment', async () => {
    const { target, assignments } = setup(0);
    await expect(
      target.deleteFacultyAssignment('faculty-2', 'tenant-1', 'assignment-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(assignments.softDelete).not.toHaveBeenCalled();
  });
});
