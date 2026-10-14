import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FinanceAccountsService } from './finance-accounts.service';

describe('FinanceAccountsService fee template and job validation', () => {
  const query = jest.fn();
  const service = new FinanceAccountsService(
    { query } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => query.mockReset());

  it('rejects empty template fields before reaching SQL', () => {
    expect(() =>
      service.createTemplate('tenant-1', {
        template_name: '',
        academic_year: '',
        total_amount: 0,
      }),
    ).toThrow(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('keeps the saved semester and monetary values', async () => {
    query.mockResolvedValueOnce([{ template_id: 'template-1' }]);
    await service.createTemplate('tenant-1', {
      template_name: 'Semester fee',
      academic_year: '2026-27',
      semester: 5,
      total_amount: 1000,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO finance_fee_templates'),
      ['tenant-1', 'Semester fee', null, null, '2026-27', 5, '{}', 1000],
    );
  });

  it("rejects another tenant's template before queueing", async () => {
    query.mockResolvedValueOnce([]);
    await expect(
      service.createBulkJob('tenant-1', {
        template_id: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT template_id FROM finance_fee_templates'),
      ['tenant-1', '11111111-1111-4111-8111-111111111111'],
    );
  });

  it('scopes job-status reads to the tenant', async () => {
    query.mockResolvedValueOnce([]);
    await expect(service.getBulkJob('tenant-1', 'job-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM finance_bulk_jobs'),
      ['tenant-1', 'job-1'],
    );
  });
});
