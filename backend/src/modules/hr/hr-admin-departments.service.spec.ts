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
});
