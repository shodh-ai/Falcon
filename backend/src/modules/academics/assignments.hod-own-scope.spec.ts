import { AssignmentsService } from './assignments.service';

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

describe('HOD teaching assignment scope', () => {
  it('uses only authored assignments for the HOD My Teaching workspace', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const assignments = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const timetable = { query: jest.fn() };
    const service = new AssignmentsService(
      assignments as any, {} as any, timetable as any, {} as any,
      {} as any, {} as any, {} as any, {} as any, {} as any,
    );

    await service.listFacultyAssignments('hod-user', 'tenant-1', 'course-1', true);

    expect(timetable.query).not.toHaveBeenCalled();
    expect(qb.andWhere).toHaveBeenCalledWith(
      'assignment.faculty_user_id = :facultyUserId',
      { facultyUserId: 'hod-user' },
    );
  });
});
