import 'reflect-metadata';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { SuperAdminController } from './super-admin.controller';
import { AdminControlController } from '../admin-control/admin-control.controller';

describe('Campus Admin cross-module role lockdown', () => {
  it('keeps SuperAdmin controller class role SuperAdmin-only', () => {
    const classRoles = Reflect.getMetadata(ROLES_KEY, SuperAdminController) as string[];
    expect(classRoles).toEqual(['SuperAdmin']);
    expect(classRoles).not.toContain('CampusAdmin');
  });

  it('does not allow CampusAdmin on impersonation endpoints', () => {
    const startRoles = Reflect.getMetadata(
      ROLES_KEY,
      SuperAdminController.prototype.startImpersonation,
    ) as string[];
    const logsRoles = Reflect.getMetadata(
      ROLES_KEY,
      SuperAdminController.prototype.impersonationLogs,
    ) as string[];
    expect(startRoles).toEqual(['SuperAdmin']);
    expect(logsRoles).toEqual(['SuperAdmin']);
  });

  it('does not allow CampusAdmin on tenant-wide assignment listing', () => {
    const listRoles = Reflect.getMetadata(
      ROLES_KEY,
      SuperAdminController.prototype.listAssignments,
    ) as string[];
    const assignableRoles = Reflect.getMetadata(
      ROLES_KEY,
      SuperAdminController.prototype.hierarchyAssignableUsers,
    ) as string[];
    expect(listRoles).toEqual(['SuperAdmin', 'Registrar']);
    expect(assignableRoles).toEqual(['SuperAdmin', 'Registrar']);
    expect(listRoles).not.toContain('CampusAdmin');
    expect(assignableRoles).not.toContain('CampusAdmin');
  });

  it('keeps Admin Control class roles without CampusAdmin', () => {
    const classRoles = Reflect.getMetadata(ROLES_KEY, AdminControlController) as string[];
    expect(classRoles).toEqual(['SuperAdmin', 'Registrar']);
    expect(classRoles).not.toContain('CampusAdmin');
  });

  it('allows CampusAdmin only on timetable conflicts bridge', () => {
    const conflictRoles = Reflect.getMetadata(
      ROLES_KEY,
      AdminControlController.prototype.timetableConflicts,
    ) as string[];
    expect(conflictRoles).toEqual(['CampusAdmin', 'SuperAdmin', 'Registrar']);

    const settingsRoles = Reflect.getMetadata(
      ROLES_KEY,
      AdminControlController.prototype.settings,
    ) as string[];
    const backupRoles = Reflect.getMetadata(
      ROLES_KEY,
      AdminControlController.prototype.backupHistory,
    ) as string[];
    expect(settingsRoles).toEqual(['SuperAdmin']);
    expect(backupRoles).toEqual(['SuperAdmin']);
  });
});
