import { ForbiddenException } from '@nestjs/common';
import { AdminOpsService } from './admin-ops.service';

describe('AdminOpsService campus scoping', () => {
  const db = { query: jest.fn() };
  const cache = {
    getOrSet: jest.fn((_key: string, fn: () => Promise<unknown>) => fn()),
    delByPrefix: jest.fn(),
  };
  const campusScope = {
    resolveCampusIds: jest.fn(),
    timetableSlotCampusMatchSql: jest.fn(
      (_alias: string, idx: number) => `campus_match_$${idx}`,
    ),
    assertTimetableSlotCampusAllowed: jest.fn(),
  };

  let service: AdminOpsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminOpsService(
      db as never,
      cache as never,
      campusScope as never,
    );
  });

  it('returns empty timetable when Campus Admin has no assigned campus', async () => {
    campusScope.resolveCampusIds.mockResolvedValue([]);

    const rows = await service.listTimetable(
      'tenant-1',
      '2025-26',
      { user_id: 'ca-1', role: 'CampusAdmin' },
    );

    expect(rows).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('scopes timetable list SQL for Campus Admin', async () => {
    campusScope.resolveCampusIds.mockResolvedValue([5]);
    db.query.mockResolvedValue([]);

    await service.listTimetable(
      'tenant-1',
      '2025-26',
      { user_id: 'ca-1', role: 'CampusAdmin' },
    );

    expect(db.query.mock.calls[0][0]).toContain('campus_match_$3');
    expect(db.query.mock.calls[0][1][2]).toEqual([5]);
  });

  it('blocks Campus Admin timetable writes outside assigned campus', async () => {
    campusScope.assertTimetableSlotCampusAllowed.mockRejectedValue(
      new ForbiddenException('Timetable slot must use faculty or a course on your assigned campus'),
    );

    await expect(
      service.upsertTimetableSlot(
        'tenant-1',
        { room_code: 'B-101', faculty_user_id: 'other-campus-faculty' },
        { user_id: 'ca-1', role: 'CampusAdmin' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
