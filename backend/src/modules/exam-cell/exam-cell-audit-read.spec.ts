import { ExamCellAuditService } from './exam-cell-audit.service';
describe('Audit history failure handling', () => {
  it('propagates audit storage failures instead of claiming there is no audit history', async () => {
    const query = jest
      .fn<Promise<Array<Record<string, unknown>>>, [string, unknown[]]>()
      .mockRejectedValue(new Error('audit storage unavailable'));
    const service = new ExamCellAuditService({ query } as never);
    await expect(service.list('tenant')).rejects.toThrow(
      'audit storage unavailable',
    );
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('retains genuine empty history and its tenant-filtered pagination', async () => {
    const query = jest
      .fn<Promise<Array<Record<string, unknown>>>, [string, unknown[]]>()
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);
    const service = new ExamCellAuditService({ query } as never);
    await expect(
      service.list('tenant', { page: 2, limit: 10 }),
    ).resolves.toEqual({ data: [], total: 0, limit: 10, offset: 10, page: 2 });
    expect(query.mock.calls[0][0]).toContain('a.tenant_id = $1');
    expect(query.mock.calls[1][1]).toEqual(['tenant', 10, 10]);
  });
});
