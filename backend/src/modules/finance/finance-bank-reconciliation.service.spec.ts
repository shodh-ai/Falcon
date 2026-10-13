import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { FinanceBankReconciliationService } from './finance-bank-reconciliation.service';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACTOR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BANK = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('FinanceBankReconciliationService', () => {
  it('fails closed in production without secure storage and a malware scanner', async () => {
    const priorNodeEnv = process.env.NODE_ENV;
    const priorScanner = process.env.FINANCE_CLAMAV_COMMAND;
    const tx = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ bank_account_id: BANK }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
    };
    const db = {
      transaction: jest.fn(async (work: (manager: typeof tx) => Promise<unknown>) =>
        work(tx),
      ),
    };
    const storage = { upload: jest.fn(), isEnabled: jest.fn(() => false) };
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.FINANCE_CLAMAV_COMMAND;
      const service = new FinanceBankReconciliationService(
        db as never,
        storage as never,
      );
      await expect(
        service.uploadStatementFile(TENANT, ACTOR, BANK, 'key', {
          buffer: Buffer.from(
            'transaction_date,value_date,description,bank_reference,debit,credit,running_balance\n2026-10-01,,Deposit,REF-1,0.00,100.00,100.00\n',
          ),
          originalname: 'statement.csv',
          mimetype: 'text/csv',
        } as never),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(storage.upload).not.toHaveBeenCalled();
    } finally {
      if (priorNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = priorNodeEnv;
      if (priorScanner === undefined)
        delete process.env.FINANCE_CLAMAV_COMMAND;
      else process.env.FINANCE_CLAMAV_COMMAND = priorScanner;
    }
  });

  it('rejects malformed or internally inconsistent statement files before storage', async () => {
    const db = { query: jest.fn() };
    const storage = { upload: jest.fn(), isEnabled: jest.fn(() => true) };
    const service = new FinanceBankReconciliationService(
      db as never,
      storage as never,
    );
    await expect(
      service.uploadStatementFile(TENANT, ACTOR, BANK, 'key', {
        buffer: Buffer.from('wrong,headers\n1,2\n'),
        originalname: 'statement.csv',
        mimetype: 'text/csv',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('does not trust client-supplied statement rows', async () => {
    const db = { transaction: jest.fn() };
    const service = new FinanceBankReconciliationService(
      db as never,
      {} as never,
    );
    await expect(
      service.importStatement(TENANT, ACTOR, 'key', {
        bank_account_id: BANK,
        period_start: '2026-10-01',
        period_end: '2026-10-31',
        opening_balance: '0.00',
        closing_balance: '100.00',
        source_upload_id: 'not-an-upload',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('prevents the proposer from approving their own match', async () => {
    const tx = {
      query: jest.fn(async () => [
        {
          match_id: 'match-1',
          statement_id: 'statement-1',
          journal_line_id: 'line-1',
          proposed_by: ACTOR,
          status: 'PROPOSED',
          statement_status: 'REVIEW_PENDING',
          revision: 1,
        },
      ]),
    };
    const db = {
      transaction: jest.fn(
        async (work: (manager: typeof tx) => Promise<unknown>) => work(tx),
      ),
    };
    const service = new FinanceBankReconciliationService(
      db as never,
      {} as never,
    );
    await expect(
      service.reviewMatch(TENANT, ACTOR, 'review-1', 'match-1', 1, true),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.query).toHaveBeenCalledTimes(1);
  });
});
