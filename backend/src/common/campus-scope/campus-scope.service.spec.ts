import { ForbiddenException } from '@nestjs/common';
import { CampusScopeService } from './campus-scope.service';

describe('CampusScopeService', () => {
  const dataSource = { query: jest.fn() };
  let service: CampusScopeService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CampusScopeService(dataSource as never);
  });

  it('treats SuperAdmin / Registrar as unrestricted', async () => {
    await expect(
      service.resolveCampusIds({ user_id: 'u1', role: 'SuperAdmin' }),
    ).resolves.toBeNull();
    await expect(
      service.resolveCampusIds({ user_id: 'u1', role: 'Registrar' }),
    ).resolves.toBeNull();
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('returns assigned campus ids for Campus Admin', async () => {
    dataSource.query.mockResolvedValueOnce([
      { entity_id: '3' },
      { entity_id: '3' },
      { entity_id: '9' },
    ]);

    await expect(
      service.resolveCampusIds({ user_id: 'ca-1', role: 'CampusAdmin' }),
    ).resolves.toEqual([3, 9]);
  });

  it('requireCampusIds rejects Campus Admin without assignment', async () => {
    dataSource.query
      .mockResolvedValueOnce([]) // hierarchy_assignments
      .mockResolvedValueOnce([]) // dept campus
      .mockResolvedValueOnce([
        { campus_id: 1 },
        { campus_id: 2 },
      ]); // multi-campus tenant → empty

    await expect(
      service.requireCampusIds({ user_id: 'ca-1', role: 'CampusAdmin' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('assertCampusIdAllowed rejects out-of-scope campus', () => {
    expect(() => service.assertCampusIdAllowed([1, 2], 9)).toThrow(
      ForbiddenException,
    );
    expect(() => service.assertCampusIdAllowed([1, 2], 2)).not.toThrow();
  });
});
