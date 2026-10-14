import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  FinanceAccountingService,
  type FinancePostingCommand,
} from './finance-accounting.service';

const command: FinancePostingCommand = {
  tenant_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  source_type: 'TEST_RECEIPT',
  source_id: 'receipt-1',
  source_revision: 1,
  idempotency_key: 'receipt-1:v1',
  entry_date: '2026-10-13',
  narration: 'Test receipt',
  lines: [
    { account_code: '1000', debit: '100.00', credit: '0.00' },
    { account_code: '4000', debit: '0.00', credit: '100.00' },
  ],
};

describe('FinanceAccountingService', () => {
  it('rejects an unbalanced posting before touching the database', async () => {
    const db = { transaction: jest.fn() };
    const service = new FinanceAccountingService(db as never);
    await expect(
      service.post({
        ...command,
        lines: [command.lines[0], { ...command.lines[1], credit: '99.99' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects negative, fractional-paise and two-sided lines', async () => {
    const service = new FinanceAccountingService({
      transaction: jest.fn(),
    } as never);
    for (const debit of ['-1.00', '1.001']) {
      await expect(
        service.post({
          ...command,
          lines: [{ ...command.lines[0], debit }, command.lines[1]],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    await expect(
      service.post({
        ...command,
        lines: [{ ...command.lines[0], credit: '1.00' }, command.lines[1]],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an impossible accounting date before querying a period', async () => {
    const db = { transaction: jest.fn() };
    const service = new FinanceAccountingService(db as never);
    await expect(
      service.post({ ...command, entry_date: '2026-02-30' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('posts both sides under one transaction with tenant-scoped account lookup', async () => {
    const queries: string[] = [];
    const tx = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes('FROM finance_books'))
          return [
            {
              book_id: 'book-1',
              base_currency: 'INR',
              authority_status: 'PROVISIONAL',
              cutover_date: null,
              ledger_sequence: '0',
            },
          ];
        if (sql.includes('FROM finance_journal_entries')) return [];
        if (sql.includes('FROM finance_fiscal_periods'))
          return [{ period_id: 'period-1' }];
        if (sql.includes('FROM finance_ledger_accounts'))
          return [
            { account_code: '1000', ledger_account_id: 'bank-1' },
            { account_code: '4000', ledger_account_id: 'income-1' },
          ];
        if (sql.includes('RETURNING journal_entry_id'))
          return [{ journal_entry_id: 'journal-1' }];
        return [];
      }),
    };
    const db = {
      transaction: jest.fn(
        async (fn: (manager: typeof tx) => Promise<unknown>) => fn(tx),
      ),
    };
    const service = new FinanceAccountingService(db as never);
    await expect(service.post(command)).resolves.toEqual({
      journal_entry_id: 'journal-1',
      book_sequence: '1',
      duplicate: false,
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(
      queries.filter((sql) =>
        sql.includes('INSERT INTO finance_journal_lines'),
      ),
    ).toHaveLength(2);
    expect(
      queries.find((sql) => sql.includes('FROM finance_ledger_accounts')),
    ).toContain('tenant_id=$1');
  });

  it('rejects a changed retry for the same source/idempotency key', async () => {
    const tx = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM finance_books'))
          return [
            {
              book_id: 'book-1',
              authority_status: 'PROVISIONAL',
              cutover_date: null,
            },
          ];
        if (sql.includes('FROM finance_journal_entries'))
          return [
            {
              journal_entry_id: 'journal-1',
              payload_hash: 'different',
            },
          ];
        return [];
      }),
    };
    const db = {
      transaction: jest.fn(
        async (fn: (manager: typeof tx) => Promise<unknown>) => fn(tx),
      ),
    };
    const service = new FinanceAccountingService(db as never);
    await expect(service.post(command)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('keeps an unapproved book provisional in reporting', async () => {
    const db = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM finance_books'))
          return [
            {
              book_id: 'book-1',
              tenant_id: command.tenant_id,
              legal_name: 'Test',
              base_currency: 'INR',
              fiscal_start_month: 4,
              authority_status: 'PROVISIONAL',
              cutover_date: null,
              ledger_sequence: '0',
            },
          ];
        return [
          {
            account_code: '1000',
            account_name: 'Bank',
            account_type: 'ASSET',
            debit: '100.00',
            credit: '100.00',
          },
        ];
      }),
    };
    const service = new FinanceAccountingService(db as never);
    const result = await service.trialBalance(command.tenant_id, '2026-10-13');
    expect(result.status).toBe('PROVISIONAL');
    expect(result.balanced).toBe(true);
  });
});
