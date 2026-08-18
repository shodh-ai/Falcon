import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AdminControlService } from './admin-control.service';

describe('AdminControlService department hierarchy', () => {
  const db = { query: jest.fn() };
  const notifications = { notify: jest.fn() };
  const campusScope = {
    resolveCampusIds: jest.fn(),
    assertRecordCampusAllowed: jest.fn(),
  };
  let service: AdminControlService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminControlService(
      db as never,
      notifications as never,
      campusScope as never,
    );
  });

  it('rejects a department whose school is not on an allowed campus', async () => {
    campusScope.resolveCampusIds.mockResolvedValue([1]);
    db.query.mockResolvedValueOnce([
      { school_id: 20, campus_id: 2, school_name: 'School of Management' },
    ]);
    campusScope.assertRecordCampusAllowed.mockImplementation(() => {
      throw new ForbiddenException('Access denied for this campus');
    });

    await expect(
      service.createDepartment(
        'tenant',
        { user_id: 'ca', role: 'CampusAdmin' },
        { dept_name: 'Computer Science', school_id: 20 },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(campusScope.assertRecordCampusAllowed).toHaveBeenCalledWith([1], 2);
  });

  it('requires the school to belong to a campus', async () => {
    campusScope.resolveCampusIds.mockResolvedValue(null);
    db.query.mockResolvedValueOnce([
      { school_id: 20, campus_id: null, school_name: 'Unlinked School' },
    ]);

    await expect(
      service.createDepartment(
        'tenant',
        { user_id: 'reg', role: 'Registrar' },
        { dept_name: 'Computer Science', school_id: 20 },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects HOD assignment for a student record', async () => {
    campusScope.resolveCampusIds.mockResolvedValue(null);
    db.query
      .mockResolvedValueOnce([{ dept_id: 5, campus_id: 1 }])
      .mockResolvedValueOnce([
        {
          user_id: 'stu',
          name: 'Student User',
          role_name: 'Student',
          is_active: true,
        },
      ]);

    await expect(
      service.assignHod(
        'tenant',
        { user_id: 'reg', role: 'Registrar' },
        { dept_id: 5, hod_user_id: 'stu' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not list departments for a Campus Admin with no campus assignment', async () => {
    campusScope.resolveCampusIds.mockResolvedValue([]);
    await expect(
      service.listDepartments({ user_id: 'ca', role: 'CampusAdmin' }),
    ).resolves.toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });
});
