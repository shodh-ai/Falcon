import { ForbiddenException } from '@nestjs/common';
import { CampusScopeService } from './campus-scope.service';

describe('CampusScopeService record authorization', () => {
  const dataSource = { query: jest.fn() };
  let service: CampusScopeService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CampusScopeService(dataSource as never);
  });

  it('denies unresolved campus ids for record access', () => {
    expect(() => service.assertRecordCampusAllowed([1], null)).toThrow(
      ForbiddenException,
    );
    expect(() => service.assertRecordCampusAllowed([1], undefined)).toThrow(
      ForbiddenException,
    );
  });

  it('denies a campus that is not assigned', () => {
    expect(() => service.assertRecordCampusAllowed([1], 2)).toThrow(
      ForbiddenException,
    );
  });

  it('allows an assigned campus', () => {
    expect(() => service.assertRecordCampusAllowed([1, 3], 3)).not.toThrow();
  });

  it('does not restrict Super Admin', async () => {
    await expect(
      service.assertActorCampusAccess(
        { user_id: 'sa', role: 'SuperAdmin' },
        99,
      ),
    ).resolves.toBeUndefined();
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('does not restrict Admissions Officer', async () => {
    await expect(
      service.assertActorCampusAccess(
        { user_id: 'ao', role: 'AdmissionsOfficer' },
        99,
      ),
    ).resolves.toBeUndefined();
  });

  it('blocks Campus Admin when the record campus cannot be resolved', async () => {
    dataSource.query.mockResolvedValueOnce([{ entity_id: '1' }]);

    await expect(
      service.assertActorCampusAccess(
        { user_id: 'ca', role: 'CampusAdmin' },
        null,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('filters hierarchy batches to programs on the assigned campus', () => {
    const tree = {
      campuses: [
        { campus_id: 1, campus_name: 'A' },
        { campus_id: 2, campus_name: 'B' },
      ],
      schools: [
        { school_id: 10, school_name: 'Eng', campus_id: 1 },
        { school_id: 20, school_name: 'Mgmt', campus_id: 2 },
      ],
      departments: [],
      programs: [
        { program_id: 100, program_name: 'BCA', school_id: 10 },
        { program_id: 200, program_name: 'MBA', school_id: 20 },
      ],
      batches: [
        { batch_id: 1, batch_name: '2025 BCA', program_id: 100 },
        { batch_id: 2, batch_name: '2025 MBA', program_id: 200 },
      ],
    };

    const scoped = service.filterHierarchy(tree, [1]);
    expect(scoped.campuses.map((row) => row.campus_id)).toEqual([1]);
    expect(scoped.programs.map((row) => row.program_id)).toEqual([100]);
    expect(scoped.batches.map((row) => row.batch_id)).toEqual([1]);
  });
});
