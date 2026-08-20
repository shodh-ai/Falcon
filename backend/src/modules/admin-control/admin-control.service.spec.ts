import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AdminControlService } from './admin-control.service';

describe('AdminControlService department hierarchy', () => {
  const db: { query: jest.Mock; transaction: jest.Mock } = {
    query: jest.fn(),
    transaction: jest.fn(),
  };
  const transactionManager = { query: jest.fn() };
  db.transaction.mockImplementation(
    async (cb: (manager: typeof transactionManager) => unknown) => cb(transactionManager),
  );
  const notifications = { notify: jest.fn() };
  const campusScope = {
    resolveCampusIds: jest.fn(),
    assertRecordCampusAllowed: jest.fn(),
  };
  const announcements = {
    listForAdmin: jest.fn(),
    create: jest.fn(),
  };
  let service: AdminControlService;

  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockReset();
    transactionManager.query.mockReset();
    service = new AdminControlService(
      db as never,
      notifications as never,
      campusScope as never,
      announcements as never,
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

  it('creates a user with matching users.role_id and user_roles primary mapping', async () => {
    db.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ role_id: 12, role_name: 'Registrar' }]);
    db.query.mockResolvedValueOnce([]);
    transactionManager.query
      .mockResolvedValueOnce([
        {
          user_id: 'user-1',
          name: 'New User',
          email: 'new@mygyanvihar.com',
          role_id: 12,
          dept_id: null,
          is_active: true,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    db.query.mockResolvedValueOnce([]);

    const result = await service.createUser('tenant', 'actor-1', {
      name: 'New User',
      email: 'new@mygyanvihar.com',
      role_name: 'Registrar',
    });

    expect(result.role_id).toBe(12);
    expect(transactionManager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_roles (user_id, role_id, is_primary)'),
      ['user-1', 12],
    );
  });

  it('changes Faculty to Registrar and synchronizes user_roles', async () => {
    db.query
      .mockResolvedValueOnce([
        {
          user_id: 'user-1',
          role_id: 2,
          role_name: 'Faculty',
          official_email: 'faculty@mygyanvihar.com',
        },
      ])
      .mockResolvedValueOnce([{ role_id: 12, role_name: 'Registrar' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    transactionManager.query
      .mockResolvedValueOnce([
        {
          user_id: 'user-1',
          name: 'Changed User',
          email: 'faculty@mygyanvihar.com',
          role_id: 12,
          dept_id: null,
          is_active: true,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.updateUser('tenant', 'actor-1', 'user-1', {
      role_name: 'Registrar',
    });

    expect(result.role_id).toBe(12);
    expect(transactionManager.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM user_roles'),
      ['user-1', 2],
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO admin_control_audit'),
      expect.arrayContaining([
        'tenant',
        'actor-1',
        'ASSIGN_ROLE',
        'user',
        'user-1',
      ]),
    );
  });

  it('changes Registrar to Faculty and synchronizes user_roles', async () => {
    db.query
      .mockResolvedValueOnce([
        {
          user_id: 'user-1',
          role_id: 12,
          role_name: 'Registrar',
          official_email: 'registrar@mygyanvihar.com',
        },
      ])
      .mockResolvedValueOnce([{ role_id: 2, role_name: 'Faculty' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    transactionManager.query
      .mockResolvedValueOnce([
        {
          user_id: 'user-1',
          name: 'Changed User',
          email: 'registrar@mygyanvihar.com',
          role_id: 2,
          dept_id: null,
          is_active: true,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.updateUser('tenant', 'actor-1', 'user-1', {
      role_name: 'Faculty',
    });

    expect(result.role_id).toBe(2);
    expect(transactionManager.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM user_roles'),
      ['user-1', 12],
    );
  });

  it('repeats the same role assignment without creating duplicate user_roles records', async () => {
    db.query
      .mockResolvedValueOnce([
        {
          user_id: 'user-1',
          role_id: 12,
          role_name: 'Registrar',
          official_email: 'registrar@mygyanvihar.com',
        },
      ])
      .mockResolvedValueOnce([{ role_id: 12, role_name: 'Registrar' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    transactionManager.query
      .mockResolvedValueOnce([
        {
          user_id: 'user-1',
          name: 'Changed User',
          email: 'registrar@mygyanvihar.com',
          role_id: 12,
          dept_id: null,
          is_active: true,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await service.updateUser('tenant', 'actor-1', 'user-1', {
      role_name: 'Registrar',
    });

    expect(transactionManager.query).not.toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM user_roles'),
      expect.anything(),
    );
    expect(db.query).not.toHaveBeenCalledWith(
      expect.stringContaining('ASSIGN_ROLE'),
      expect.anything(),
    );
  });
});
