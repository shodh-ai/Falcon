import { FinanceLedgerService } from './finance-ledger.service';

describe('FinanceLedgerService vendor accrual', () => {
  it('records taxable expense and GST against AP and TDS without crediting cash', async () => {
    const inserted: unknown[][] = [];
    const tx = {
      query: jest.fn(async (sql: string, args: unknown[]) => {
        if (sql.includes('FROM finance_journal_entries')) return [];
        if (sql.includes('FROM finance_ledger_accounts'))
          return [
            { account_code: '5100', ledger_account_id: 'expense' },
            { account_code: '5200', ledger_account_id: 'gst' },
            { account_code: '2000', ledger_account_id: 'payable' },
            { account_code: '5300', ledger_account_id: 'tds' },
          ];
        if (sql.includes('RETURNING journal_entry_id'))
          return [{ journal_entry_id: 'journal-1' }];
        if (sql.includes('INSERT INTO finance_journal_lines'))
          inserted.push(args);
        return [];
      }),
    };
    const ledger = new FinanceLedgerService({} as never);
    await ledger.postVendorInvoiceAccrual(
      'tenant-1',
      'invoice-1',
      108,
      18,
      10,
      tx as never,
    );
    expect(inserted).toHaveLength(4);
    const debit = inserted.reduce((sum, args) => sum + Number(args[2]), 0);
    const credit = inserted.reduce((sum, args) => sum + Number(args[3]), 0);
    expect(debit).toBe(credit);
    expect(inserted.map((args) => args[1])).not.toContain('bank');
    expect(inserted.find((args) => args[1] === 'payable')).toEqual([
      'journal-1',
      'payable',
      0,
      108,
      'VENDOR_PAYABLE',
    ]);
  });
});
