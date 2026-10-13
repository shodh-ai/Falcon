import { HrAdminService } from './hr-admin.service';

describe('HR directory department metadata', () => {
  it('returns only departments with staff in the selected tenant and entity', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new HrAdminService(
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.listDepartments('tenant-one', 7);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('u.tenant_id = $1 AND p.entity_id = $2'),
      ['tenant-one', 7],
    );
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('p.tenant_id = u.tenant_id');
    expect(sql).toContain('d.deleted_at IS NULL');
    expect(sql).toContain("r.role_name NOT IN ('Student', 'Applicant', 'Parent')");
  });

  it('offers empty departments for onboarding without exposing another tenant\'s assigned departments', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new HrAdminService(
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.listAvailableDepartments('tenant-one');

    expect(query).toHaveBeenCalledWith(expect.any(String), ['tenant-one']);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('u.tenant_id = $1');
    expect(sql).toContain('OR NOT EXISTS');
    expect(sql).toContain('d.deleted_at IS NULL');
  });
});
