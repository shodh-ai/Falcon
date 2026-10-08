import { AdmissionsService } from './admissions.service';
import { CampusScopeService } from '../../common/campus-scope/campus-scope.service';

describe('AdmissionsService enrolled students visibility', () => {
  const dataSource = { query: jest.fn() };
  const campusScope = {
    resolveCampusIds: jest.fn(),
    assertActorCampusAccess: jest.fn(),
    campusIdForProgram: jest.fn().mockResolvedValue(7),
    campusIdForMeritPreference: jest.fn().mockResolvedValue(null),
    campusIdForApplication: jest.fn().mockResolvedValue(null),
    studentCampusVisibilityClause: jest.fn(
      CampusScopeService.prototype.studentCampusVisibilityClause,
    ),
  };
  const leads = { findOne: jest.fn(), save: jest.fn() };
  const scoring = { scoreLead: jest.fn() };

  let service: AdmissionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdmissionsService(
      leads as never,
      {} as never,
      {} as never,
      dataSource as never,
      scoring as never,
      {} as never,
      campusScope as never,
    );
  });

  it('scopes enrolled students with campus visibility clause (not inner dept join)', async () => {
    campusScope.resolveCampusIds.mockResolvedValueOnce([3]);
    dataSource.query.mockResolvedValueOnce([]);

    await service.getEnrolledStudents('tenant-1', undefined, undefined, undefined, {
      user_id: 'ca-1',
      role: 'CampusAdmin',
    });

    const sql = String(dataSource.query.mock.calls[0][0]);
    expect(sql).toContain('LEFT JOIN departments d');
    expect(sql).toMatch(/OR EXISTS/i);
    expect(sql).not.toMatch(
      /JOIN departments d ON d\.dept_id = u\.dept_id AND d\.deleted_at IS NULL\s+JOIN schools s/i,
    );
    expect(dataSource.query.mock.calls[0][1]).toEqual(
      expect.arrayContaining(['tenant-1', [3]]),
    );
  });

  it('assigns department from lead program during enrollment provisioning', async () => {
    dataSource.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ role_id: 9 }])
      .mockResolvedValueOnce([{ user_id: 'student-1' }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([
        {
          program_id: 12,
          program_name: 'B.Tech CSE',
          program_code: 'BTECH-CSE',
          dept_id: 55,
          school_name: 'School of Engineering',
        },
      ])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ activity_id: 'act-1' }]);
    leads.save.mockResolvedValue(undefined);

    const lead = {
      lead_id: 'lead-1',
      tenant_id: 'tenant-1',
      full_name: 'Test Student',
      email: 'test@example.com',
      phone: '9999999999',
      preferred_program_id: 12,
      metadata: {},
    } as never;
    leads.findOne.mockResolvedValue(lead);
    leads.findOne.mockResolvedValue(lead);

    const result = await service.provisionStudentFromLead(lead, 'tenant-1');

    expect(result.created).toBe(true);
    expect(result.enrollment_no).toMatch(/^ENR-/);
    const updateDeptCall = dataSource.query.mock.calls.find(
      (call) =>
        String(call[0]).includes('UPDATE users SET dept_id') &&
        call[1]?.[0] === 'student-1',
    );
    expect(updateDeptCall?.[1]).toEqual(['student-1', 55, 'tenant-1']);
    const profileCall = dataSource.query.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO student_profiles'),
    );
    expect(profileCall?.[1]).toEqual(
      expect.arrayContaining(['tenant-1', 'student-1', expect.any(String), '2026']),
    );
  });
});
