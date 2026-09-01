import { ForbiddenException } from '@nestjs/common';
import { AdminControlController } from './admin-control.controller';

describe('AdminControlController RBAC', () => {
  const service = {
    listUsers: jest.fn(),
    exportUsers: jest.fn(),
    importUsers: jest.fn(),
    createUser: jest.fn(),
    updateUser: jest.fn(),
    deleteUser: jest.fn(),
    suspendUser: jest.fn(),
    deactivateUser: jest.fn(),
    activateUser: jest.fn(),
    resetPassword: jest.fn(),
    listDepartments: jest.fn(),
    listDepartmentLookups: jest.fn(),
    listHodCandidates: jest.fn(),
    getDepartment: jest.fn(),
    createDepartment: jest.fn(),
    updateDepartment: jest.fn(),
    deleteDepartment: jest.fn(),
    restoreDepartment: jest.fn(),
    assignHod: jest.fn(),
    removeHod: jest.fn(),
    listAuditLogs: jest.fn(),
    listAnnouncements: jest.fn(),
    createAnnouncement: jest.fn(),
  };

  let controller: AdminControlController;

  const pureCampusAdminReq = {
    user: {
      user_id: 'campus-admin-1',
      tenant_id: 'tenant-1',
      role: 'CampusAdmin',
      roles: ['CampusAdmin'],
    },
  };

  const registrarReq = {
    user: {
      user_id: 'registrar-1',
      tenant_id: 'tenant-1',
      role: 'Registrar',
      roles: ['Registrar'],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AdminControlController(service as never);
  });

  it('denies pure Campus Admin from user management endpoints', () => {
    expect(() => controller.users(pureCampusAdminReq, undefined, undefined, undefined, undefined, undefined)).toThrow(
      ForbiddenException,
    );
    expect(() =>
      controller.createUser(pureCampusAdminReq, {
        name: 'Test User',
        email: 'test@example.com',
        role_name: 'Registrar',
      }),
    ).toThrow(ForbiddenException);
  });

  it('denies pure Campus Admin from department endpoints', () => {
    expect(() => controller.departments(pureCampusAdminReq, undefined, undefined, undefined, 'active')).toThrow(
      ForbiddenException,
    );
    expect(() => controller.departmentLookups(pureCampusAdminReq)).toThrow(ForbiddenException);
    expect(() =>
      controller.createDept(pureCampusAdminReq, {
        dept_name: 'Computer Science',
        school_id: 1,
      }),
    ).toThrow(ForbiddenException);
    expect(() =>
      controller.assignHod(pureCampusAdminReq, {
        dept_id: 1,
        hod_user_id: '00000000-0000-4000-8000-000000000001',
      }),
    ).toThrow(ForbiddenException);
    expect(() => controller.removeHod(pureCampusAdminReq, '1')).toThrow(ForbiddenException);
  });

  it('denies pure Campus Admin from communication and audit endpoints', () => {
    expect(() => controller.announcements(pureCampusAdminReq)).toThrow(ForbiddenException);
    expect(() =>
      controller.createAnnouncement(pureCampusAdminReq, {
        title: 'Notice',
        body: 'Body',
        category: 'CIRCULAR',
        audience: 'everyone',
      }),
    ).toThrow(ForbiddenException);
    expect(() =>
      controller.broadcast(pureCampusAdminReq, {
        title: 'Ping',
        message: 'Hello',
        audience: 'everyone',
      }),
    ).toThrow(ForbiddenException);
    expect(() => controller.auditLogs(pureCampusAdminReq, undefined, undefined, undefined, undefined)).toThrow(
      ForbiddenException,
    );
  });

  it('denies pure Campus Admin from courses, reports, helpdesk bridge, and dashboard', () => {
    expect(() => controller.dashboard(pureCampusAdminReq)).toThrow(ForbiddenException);
    expect(() => controller.courses(pureCampusAdminReq)).toThrow(ForbiddenException);
    expect(() => controller.reports(pureCampusAdminReq)).toThrow(ForbiddenException);
    expect(() => controller.tickets(pureCampusAdminReq)).toThrow(ForbiddenException);
    expect(() => controller.portalAccess(pureCampusAdminReq)).toThrow(ForbiddenException);
    expect(() => controller.structure(pureCampusAdminReq)).toThrow(ForbiddenException);
  });

  it('allows Registrar to reach those admin-only endpoints', () => {
    service.listUsers.mockReturnValue({ items: [] });
    service.listDepartments.mockReturnValue([]);
    service.listAnnouncements.mockReturnValue([]);
    service.listAuditLogs.mockReturnValue({ items: [], limit: 5, offset: 0 });

    expect(controller.users(registrarReq, undefined, undefined, undefined, undefined, undefined)).toEqual({
      items: [],
    });
    expect(controller.departments(registrarReq, undefined, undefined, undefined, 'active')).toEqual([]);
    expect(controller.announcements(registrarReq)).toEqual([]);
    expect(controller.auditLogs(registrarReq, undefined, undefined, '5', '0')).toEqual({
      items: [],
      limit: 5,
      offset: 0,
    });
  });
});
