import { ForbiddenException } from '@nestjs/common';
import { CampusAdminService } from './campus-admin.service';

describe('CampusAdminService.profile', () => {
  const campusScope = {
    requireCampusIds: jest.fn(),
    assertRecordCampusAllowed: jest.fn(),
  };
  const dataSource = {
    query: jest.fn(),
  };

  let service: CampusAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CampusAdminService(
      dataSource as never,
      campusScope as never,
      { assignEntity: jest.fn(), revokeAssignment: jest.fn() } as never,
    );
  });

  it('loads only campuses returned by CampusScopeService', async () => {
    campusScope.requireCampusIds.mockResolvedValue([7]);
    dataSource.query.mockResolvedValue([
      { campus_id: 7, campus_name: 'Jaipur Campus' },
    ]);

    const rows = await service.profile({
      user_id: 'ca-1',
      role: 'CampusAdmin',
      tenant_id: 'tenant-1',
    });

    expect(campusScope.requireCampusIds).toHaveBeenCalled();
    expect(dataSource.query.mock.calls[0][1][0]).toEqual([7]);
    expect(dataSource.query.mock.calls[0][1][1]).toBe('tenant-1');
    expect(rows).toEqual([{ campus_id: 7, campus_name: 'Jaipur Campus' }]);
  });

  it('fails when no campus is assigned', async () => {
    campusScope.requireCampusIds.mockRejectedValue(
      new ForbiddenException('No campus is assigned to this Campus Admin account'),
    );

    await expect(
      service.profile({ user_id: 'ca-1', role: 'CampusAdmin' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('loads hierarchy only for assigned campus ids', async () => {
    campusScope.requireCampusIds.mockResolvedValue([3]);
    dataSource.query.mockResolvedValue([]);

    await service.hierarchy({ user_id: 'ca-1', role: 'CampusAdmin' });

    expect(campusScope.requireCampusIds).toHaveBeenCalled();
    for (const call of dataSource.query.mock.calls) {
      expect(call[1][0]).toEqual([3]);
    }
  });

  it('scopes courses to assigned campus ids', async () => {
    campusScope.requireCampusIds.mockResolvedValue([3]);
    dataSource.query.mockResolvedValue([]);

    await service.courses({
      user_id: 'ca-1',
      role: 'CampusAdmin',
      tenant_id: 'tenant-1',
    });

    expect(campusScope.requireCampusIds).toHaveBeenCalled();
    expect(dataSource.query.mock.calls[0][1][0]).toBe('tenant-1');
    expect(dataSource.query.mock.calls[0][1][1]).toEqual([3]);
  });

  it('rejects creating a program whose school is not on the assigned campus', async () => {
    campusScope.requireCampusIds.mockResolvedValue([1]);
    dataSource.query.mockResolvedValueOnce([
      { school_id: 9, school_name: 'Other School', campus_id: 2 },
    ]);
    campusScope.assertRecordCampusAllowed.mockImplementation(() => {
      throw new ForbiddenException('Access denied for this campus');
    });

    await expect(
      service.createProgram(
        { user_id: 'ca-1', role: 'CampusAdmin' },
        {
          program_name: 'B.Tech CSE',
          program_code: 'CSE',
          school_id: 9,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
