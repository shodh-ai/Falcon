import { CounselingService } from './counseling.service';

describe('CounselingService campus scope', () => {
  const db = { query: jest.fn() };
  const campusScope = {
    resolveCampusIds: jest.fn(),
    requireCampusIds: jest.fn(),
    assertActorCampusAccess: jest.fn(),
    campusIdForProgramCode: jest.fn(),
  };

  let service: CounselingService;

  beforeEach(() => {
    jest.clearAllMocks();
    campusScope.resolveCampusIds.mockResolvedValue(null);
    service = new CounselingService(db as never, campusScope as never);
  });

  it('does not write tenant-wide counseling rules for Campus Admin', async () => {
    campusScope.resolveCampusIds.mockResolvedValueOnce([7]);
    campusScope.requireCampusIds.mockResolvedValueOnce([7]);

    const result = await service.generateMeritList(
      'tenant-1',
      '2026-27',
      { sc_pct: 10 },
      { user_id: 'ca', role: 'CampusAdmin' },
    );

    expect(db.query).not.toHaveBeenCalled();
    expect(result.message).toContain('assigned campus');
    expect(result.campus_ids).toEqual([7]);
  });

  it('writes tenant-wide counseling rules for Registrar', async () => {
    db.query.mockResolvedValueOnce([]);

    await service.generateMeritList('tenant-1', '2026-27', { sc_pct: 10 }, {
      user_id: 'reg',
      role: 'Registrar',
    });

    expect(db.query).toHaveBeenCalled();
  });

  it('rejects allotment when campus cannot be resolved for Campus Admin', async () => {
    campusScope.campusIdForProgramCode.mockResolvedValueOnce(null);
    campusScope.assertActorCampusAccess.mockRejectedValueOnce(
      Object.assign(new Error('Access denied for this campus'), {
        status: 403,
      }),
    );

    await expect(
      service.allotSeat('tenant-1', 'BTECH-X', '2026-27', {
        user_id: 'ca',
        role: 'CampusAdmin',
      }),
    ).rejects.toBeDefined();
    expect(db.query).not.toHaveBeenCalled();
  });
});
