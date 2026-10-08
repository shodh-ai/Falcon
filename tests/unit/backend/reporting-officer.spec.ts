import {
  canAccessTeamApprovals,
  fetchDepartmentHodUserId,
  hasDirectReports,
  isFacultyOnlyRole,
  resolveDefaultReportingOfficerId,
} from '../../../backend/src/modules/hr/utils/reporting-officer.util';

describe('reporting-officer.util', () => {
  it('resolveDefaultReportingOfficerId uses explicit override', () => {
    expect(
      resolveDefaultReportingOfficerId({
        roleName: 'Faculty',
        hodUserId: 'hod1',
        employeeUserId: 'f1',
        explicitReportingOfficerId: 'custom',
      }),
    ).toBe('custom');
  });

  it('defaults faculty to department HOD', () => {
    expect(
      resolveDefaultReportingOfficerId({
        roleName: 'Faculty',
        hodUserId: 'hod1',
        employeeUserId: 'f1',
      }),
    ).toBe('hod1');
  });

  it('returns null when faculty is their own HOD', () => {
    expect(
      resolveDefaultReportingOfficerId({
        roleName: 'Faculty',
        hodUserId: 'f1',
        employeeUserId: 'f1',
      }),
    ).toBeNull();
  });

  it('isFacultyOnlyRole distinguishes manager hats', () => {
    expect(isFacultyOnlyRole(['Faculty'])).toBe(true);
    expect(isFacultyOnlyRole(['Faculty', 'HOD'])).toBe(false);
  });

  it('fetchDepartmentHodUserId queries department', async () => {
    const query = jest.fn().mockResolvedValue([{ hod_user_id: 'hod9' }]);
    await expect(fetchDepartmentHodUserId(query, 10)).resolves.toBe('hod9');
  });

  it('hasDirectReports reflects subordinate count', async () => {
    const query = jest.fn().mockResolvedValue([{ count: '3' }]);
    await expect(hasDirectReports(query, 't1', 'u1')).resolves.toBe(true);
  });

  it('canAccessTeamApprovals allows managers without direct reports', async () => {
    const query = jest.fn();
    await expect(
      canAccessTeamApprovals(query, 't1', 'u1', ['HOD']),
    ).resolves.toBe(true);
  });
});
