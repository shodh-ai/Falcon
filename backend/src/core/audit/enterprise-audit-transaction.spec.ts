import { EnterpriseAuditService } from './enterprise-audit.service';

describe('Enterprise audit transaction boundary', () => {
  const context = {
    tenantId: 'tenant',
    userId: 'actor',
    module: 'official_transcripts',
    action: 'TRANSCRIPT_GENERATED',
  };

  it('uses only the provided transaction for both audit records', async () => {
    const globalQuery = jest.fn();
    const query = jest.fn().mockResolvedValue([]);
    const service = new EnterpriseAuditService({ query: globalQuery } as never);
    await service.log(context, { query });
    expect(query).toHaveBeenCalledTimes(2);
    expect(globalQuery).not.toHaveBeenCalled();
  });

  it('propagates secondary audit failures so the surrounding transaction rolls back', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('audit unavailable'));
    const service = new EnterpriseAuditService({} as never);
    await expect(service.log(context, { query })).rejects.toThrow(
      'audit unavailable',
    );
  });

  it('preserves optional secondary logging for existing nontransactional callers', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('secondary unavailable'));
    const service = new EnterpriseAuditService({ query } as never);
    await expect(service.log(context)).resolves.toBeUndefined();
  });
});
