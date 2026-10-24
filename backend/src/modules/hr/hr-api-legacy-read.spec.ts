import { HrAdminService } from './hr-admin.service';
describe('Legacy API appraisal history reads', () => {
  it('does not calculate or overwrite an assessment when the list is opened', async () => {
    const query = jest
      .fn()
      .mockResolvedValue([
        { appraisal_record_id: 'saved', auto_api_score: '42' },
      ]);
    const service = Object.assign(Object.create(HrAdminService.prototype), {
      dataSource: { query },
      entityCtx: { entityFilterSql: () => '' },
    }) as HrAdminService;
    const calculate = jest.spyOn(service, 'calculateApiScore');
    expect(await service.listAppraisalsWithApi('tenant', 2026, 7)).toEqual([
      { appraisal_record_id: 'saved', auto_api_score: '42' },
    ]);
    expect(calculate).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).not.toMatch(/INSERT|UPDATE|DELETE/);
    expect(query.mock.calls[0][1]).toEqual(['tenant', 7, 2026]);
  });
  it('does not overwrite a concurrently created legacy assessment', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { auto_api_score: 42, hr_final_status: 'HR_APPROVED' },
      ]);
    const service = Object.assign(Object.create(HrAdminService.prototype), {
      dataSource: { query },
    }) as HrAdminService;
    expect(
      await service.calculateApiScore('tenant', 'employee', 2026),
    ).toMatchObject({ auto_api_score: 42, hr_final_status: 'HR_APPROVED' });
    expect(query.mock.calls[1][0]).toContain('DO NOTHING');
    expect(query.mock.calls[1][0]).not.toContain('DO UPDATE');
  });
});
