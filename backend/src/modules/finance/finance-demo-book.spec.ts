import { NotFoundException } from '@nestjs/common';
import { FinanceAccountsService } from './finance-accounts.service';

describe('SGVU Finance demo book', () => {
  const tenantId = 'sgvu-tenant';
  const userId = 'finance-user';

  function serviceWithResponses(responses: unknown[]) {
    const query = jest.fn();
    for (const response of responses) query.mockResolvedValueOnce(response);
    const service = new FinanceAccountsService(
      { query } as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
    );
    return { service, query };
  }

  it('requires the exact tenant and owner before returning synthetic records', async () => {
    const { service, query } = serviceWithResponses([
      [{ book_id: 'demo-book', code: 'DEMO', title: 'Demo' }],
      [{ record_type: 'JOURNAL', status: 'BALANCED_NOT_POSTED' }],
    ]);

    const result = await service.getDemoBook(tenantId, userId);
    const calls = query.mock.calls as unknown as Array<[string, unknown[]]>;

    expect(result.demo_only).toBe(true);
    expect(result.records).toHaveLength(1);
    expect(calls[0][0]).toContain("t.subdomain='sgvu'");
    expect(calls[0][0]).toContain(
      "lower(u.official_email)='finance@mygyanvihar.com'",
    );
    expect(calls[0][1]).toEqual([tenantId, userId]);
    expect(calls[1][1]).toEqual(['demo-book']);
  });

  it('does not expose another account’s demo book', async () => {
    const { service, query } = serviceWithResponses([[]]);
    await expect(service.getDemoBook(tenantId, userId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(query).toHaveBeenCalledTimes(1);
  });
});
