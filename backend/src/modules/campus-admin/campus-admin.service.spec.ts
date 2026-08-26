import { ForbiddenException } from '@nestjs/common';
import { CampusAdminService } from './campus-admin.service';

describe('CampusAdminService.profile', () => {
  const campusScope = {
    requireCampusIds: jest.fn(),
    assertRecordCampusAllowed: jest.fn(),
    studentCampusVisibilityClause: jest.fn(
      (tenantParam: number, campusParam: number) =>
        `(s.campus_id = ANY($${campusParam}::int[]) OR sp.campus_id = ANY($${campusParam}::int[]))`,
    ),
  };
  const dataSource = {
    query: jest.fn(),
    transaction: jest.fn(),
  };

  const ticketService = {
    getTicketById: jest.fn(),
  };
  const adminControl = {
    listDepartments: jest.fn(),
    listDepartmentLookups: jest.fn(),
    listHodCandidates: jest.fn(),
    createDepartment: jest.fn(),
    updateDepartment: jest.fn(),
    deleteDepartment: jest.fn(),
    restoreDepartment: jest.fn(),
  };

  let service: CampusAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CampusAdminService(
      dataSource as never,
      campusScope as never,
      { assignEntity: jest.fn(), revokeAssignment: jest.fn() } as never,
      ticketService as never,
      adminControl as never,
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

  it('loads faculty detail only for assigned campus ids', async () => {
    campusScope.requireCampusIds.mockResolvedValue([3]);
    dataSource.query
      .mockResolvedValueOnce([
        {
          user_id: '11111111-1111-4111-8111-111111111111',
          name: 'Dr Ajeet Singh Shekhawat',
          email: 'ajeet@example.com',
          onboarding_profile: {},
        },
      ])
      .mockResolvedValueOnce([]);

    await service.facultyStaffDetail(
      { user_id: 'ca-1', role: 'CampusAdmin', tenant_id: 'tenant-1' },
      '11111111-1111-4111-8111-111111111111',
    );

    expect(campusScope.requireCampusIds).toHaveBeenCalled();
    expect(dataSource.query.mock.calls[0][1][2]).toEqual([3]);
  });

  it('filters HOD role on the server for faculty-staff list', async () => {
    campusScope.requireCampusIds.mockResolvedValue([3]);
    dataSource.query.mockResolvedValueOnce([]);

    await service.facultyStaff(
      { user_id: 'ca-1', role: 'CampusAdmin', tenant_id: 'tenant-1' },
      undefined,
      'hod',
    );

    expect(dataSource.query.mock.calls[0][0]).toContain("lower(r.role_name) IN ('hod')");
    expect(dataSource.query.mock.calls[0][1][1]).toEqual([3]);
  });

  it('loads student detail only for assigned campus ids', async () => {
    campusScope.requireCampusIds.mockResolvedValue([3]);
    dataSource.query.mockResolvedValueOnce([
      {
        user_id: '22222222-2222-4222-8222-222222222222',
        name: 'ABHISHEK KUMAR RANJAN',
        email: 'abhishek@example.com',
        parent_info: {},
      },
    ]);

    await service.studentsDetail(
      { user_id: 'ca-1', role: 'CampusAdmin', tenant_id: 'tenant-1' },
      '22222222-2222-4222-8222-222222222222',
    );

    expect(campusScope.requireCampusIds).toHaveBeenCalled();
    expect(dataSource.query.mock.calls[0][1][2]).toEqual([3]);
  });

  it('loads department detail only for assigned campus ids', async () => {
    campusScope.requireCampusIds.mockResolvedValue([3]);
    dataSource.query.mockResolvedValueOnce([
      {
        dept_id: 12,
        dept_name: 'C3WR',
        school_name: 'Centre for Climate Change & Water',
        program_count: 0,
        faculty_count: 2,
        student_count: 4,
        course_count: 0,
      },
    ]);

    await service.departmentDetail(
      { user_id: 'ca-1', role: 'CampusAdmin', tenant_id: 'tenant-1' },
      12,
    );

    expect(campusScope.requireCampusIds).toHaveBeenCalled();
    expect(dataSource.query.mock.calls[0][1][1]).toEqual([3]);
  });

  it('loads applications only for assigned campus ids', async () => {
    campusScope.requireCampusIds.mockResolvedValue([3]);
    dataSource.query.mockResolvedValueOnce([]);

    await service.applications({
      user_id: 'ca-1',
      role: 'CampusAdmin',
      tenant_id: 'tenant-1',
    });

    expect(campusScope.requireCampusIds).toHaveBeenCalled();
    expect(dataSource.query.mock.calls[0][1][0]).toEqual([3]);
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

  it('loads campus ticket inbox with campus scope filters', async () => {
    campusScope.requireCampusIds.mockResolvedValue([1]);
    dataSource.query.mockResolvedValue([
      { ticket_id: 't-1', ticket_ref: 'TKT-0001', status: 'PENDING' },
    ]);

    const rows = await service.requests(
      { user_id: 'ca-1', role: 'CampusAdmin', tenant_id: 'tenant-1' },
      { status: 'PENDING', q: 'wifi' },
    );

    expect(campusScope.requireCampusIds).toHaveBeenCalled();
    expect(rows).toHaveLength(1);
    expect(String(dataSource.query.mock.calls[0][0])).toContain('s.campus_id = ANY($2::int[])');
  });

  it('delegates ticket detail lookup to TicketService with campus scope', async () => {
    ticketService.getTicketById.mockResolvedValue({ ticket_id: 't-1' });

    const detail = await service.requestDetail(
      { user_id: 'ca-1', role: 'CampusAdmin', tenant_id: 'tenant-1' },
      't-1',
    );

    expect(ticketService.getTicketById).toHaveBeenCalledWith(
      't-1',
      'ca-1',
      'CampusAdmin',
      'tenant-1',
      expect.objectContaining({ user_id: 'ca-1' }),
    );
    expect(detail).toEqual({ ticket_id: 't-1' });
  });

  it('rejects SuperAdmin role assignment for Campus Admin create', async () => {
    campusScope.requireCampusIds.mockResolvedValue([1]);
    await expect(
      service.createManagedUser(
        { user_id: 'ca-1', role: 'CampusAdmin', tenant_id: 'tenant-1' },
        {
          name: 'Should Fail',
          email: 'fail@mygyanvihar.com',
          role_name: 'SuperAdmin',
          dept_id: 10,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects create when department is outside campus', async () => {
    campusScope.requireCampusIds.mockResolvedValue([1]);
    dataSource.query.mockResolvedValueOnce([
      { dept_id: 10, campus_id: 2 },
    ]);
    campusScope.assertRecordCampusAllowed.mockImplementation(() => {
      throw new ForbiddenException('Access denied for this campus');
    });

    await expect(
      service.createManagedUser(
        { user_id: 'ca-1', role: 'CampusAdmin', tenant_id: 'tenant-1' },
        {
          name: 'Faculty User',
          email: 'faculty.new@mygyanvihar.com',
          role_name: 'Faculty',
          dept_id: 10,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects SuperAdmin role-permission updates from Campus Admin', async () => {
    campusScope.requireCampusIds.mockResolvedValue([1]);
    await expect(
      service.updateRolePermissions(
        { user_id: 'ca-1', role: 'CampusAdmin', tenant_id: 'tenant-1' },
        'SuperAdmin',
        { view: ['academics'], edit: ['academics'] },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects privileged resource grants from Campus Admin', async () => {
    campusScope.requireCampusIds.mockResolvedValue([1]);
    dataSource.query.mockResolvedValueOnce([{ role_id: 3, role_name: 'Faculty' }]);
    await expect(
      service.updateRolePermissions(
        { user_id: 'ca-1', role: 'CampusAdmin', tenant_id: 'tenant-1' },
        'Faculty',
        { view: ['*'], edit: ['admin_ops'] },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
