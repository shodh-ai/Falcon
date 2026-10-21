import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { FinanceReceiptService } from './finance-receipt.service';
import { FinanceService } from './finance.service';

describe('Receipt originals and references', () => {
  const tenant = 'a0000000-0000-4000-8000-000000000001';
  const params = {
    tenantId: tenant,
    transactionId: 'a0000000-0000-4000-8000-000000000002',
    receiptNumber: 'RCP-SYNTHETIC',
    studentUserId: 'student-a',
    amount: 12.5,
  };
  let root: string;
  let service: FinanceReceiptService;
  let query: jest.Mock;
  let txQuery: jest.Mock;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'falcon-receipt-'));
    query = jest.fn().mockResolvedValue([
      {
        name: 'Synthetic Student',
        official_email: 'synthetic@example.test',
        enrollment_no: 'TEST001',
      },
    ]);
    txQuery = jest.fn(async (sql: string) =>
      sql.includes('RETURNING receipt_id') ? [{ receipt_id: 'receipt-a' }] : [],
    );
    service = new FinanceReceiptService(
      {
        query,
        transaction: (fn) => fn({ query: txQuery }),
      } as unknown as DataSource,
      new ConfigService({ UPLOAD_PATH: root }),
    );
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('keeps the legacy original and produces unique immutable PDFs for repeated generation', async () => {
    const folder = join(
      root,
      tenant,
      'receipts',
      String(new Date().getFullYear()),
    );
    mkdirSync(folder, { recursive: true });
    const legacy = join(folder, params.receiptNumber + '.pdf');
    writeFileSync(legacy, 'synthetic legacy original');
    const first = await service.generateAndStore(params);
    const second = await service.generateAndStore(params);
    expect(first).not.toBe(second);
    expect(readFileSync(legacy, 'utf8')).toBe('synthetic legacy original');
    expect(readdirSync(folder)).toHaveLength(3);
    const generated = txQuery.mock.calls.filter(([sql]) =>
      sql.includes("'GENERATED'"),
    );
    for (const [, args] of generated) {
      const file = join(root, args[3].replace('/uploads/', ''));
      expect(readFileSync(file).subarray(0, 4).toString()).toBe('%PDF');
      expect(args[4]).toBe(
        createHash('sha256').update(readFileSync(file)).digest('hex'),
      );
    }
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('u.tenant_id = $2'),
      [params.studentUserId, tenant],
    );
  });

  it('retains the original reference before replacing the current generated receipt', async () => {
    txQuery.mockImplementation(async (sql: string) =>
      sql.startsWith('SELECT')
        ? [
            {
              transaction_id: params.transactionId,
              receipt_url: '/uploads/legacy.pdf',
            },
          ]
        : sql.includes('RETURNING receipt_id')
          ? [{ receipt_id: 'receipt-a' }]
          : [],
    );
    await service.generateAndStore(params);
    const legacy = txQuery.mock.calls.find(([sql]) => sql.includes("'LEGACY'"));
    expect(legacy[1]).toEqual([
      tenant,
      params.transactionId,
      params.receiptNumber,
      '/uploads/legacy.pdf',
    ]);
    expect(txQuery.mock.calls.indexOf(legacy)).toBeLessThan(
      txQuery.mock.calls.findIndex(([sql]) =>
        sql.includes('ON CONFLICT (tenant_id, receipt_number)'),
      ),
    );
  });

  it('does not replace another transactions receipt and keeps the new file for investigation', async () => {
    txQuery.mockResolvedValue([
      {
        transaction_id: 'different-transaction',
        receipt_url: '/uploads/original.pdf',
      },
    ]);
    await expect(service.generateAndStore(params)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(txQuery.mock.calls.some(([sql]) => sql.includes('UPDATE SET'))).toBe(
      false,
    );
    const folder = join(
      root,
      tenant,
      'receipts',
      String(new Date().getFullYear()),
    );
    expect(readdirSync(folder)).toHaveLength(1);
  });

  it.each(['../escape', '/absolute', 'receipt/other'])(
    'rejects unsafe receipt path %s without writing anything',
    async (receiptNumber) => {
      await expect(
        service.generateAndStore({ ...params, receiptNumber }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(readdirSync(root)).toEqual([]);
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('fails closed for a student outside the authenticated tenant', async () => {
    query.mockResolvedValue([]);
    await expect(service.generateAndStore(params)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(readdirSync(root)).toEqual([]);
  });

  function finance(rows: Array<{ receipt_url: string | null }>) {
    const manager = {
      query: jest.fn(async (sql: string, _params: unknown[]) =>
        sql.startsWith('SELECT') ? rows : [],
      ),
    };
    const builder = {
      withDeleted: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const transactions = {
      createQueryBuilder: jest.fn().mockReturnValue(builder),
      manager: { transaction: (fn) => fn(manager) },
    };
    const target = new FinanceService(
      {} as any,
      transactions as any,
      {} as any,
      {} as any,
    );
    return { target, transactions, manager, builder };
  }

  it('requires explicit tenant context for transaction listing and receipt replacement', async () => {
    const { target, transactions, manager } = finance([]);
    expect(() => target.listTransactions('')).toThrow(ForbiddenException);
    await expect(
      target.uploadReceipt('', 'transaction-a', '/uploads/a.pdf', 'actor-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transactions.createQueryBuilder).not.toHaveBeenCalled();
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('scopes transaction reads by tenant, including a supplied student filter', async () => {
    const { target, builder } = finance([]);
    await target.listTransactions(tenant);
    await target.listTransactions(tenant, 'student-a');
    expect(builder.where).toHaveBeenCalledWith(
      expect.stringContaining('t.tenant_id = :tenantId'),
      { tenantId: tenant },
    );
    expect(builder.leftJoin).toHaveBeenCalledTimes(4);
    expect(builder.andWhere).toHaveBeenCalledWith(
      't.student_user_id = :studentUserId',
      { studentUserId: 'student-a' },
    );
    expect(builder.getMany).toHaveBeenCalledTimes(2);
  });

  it('denies a foreign/missing transaction before writing version rows', async () => {
    const { target, manager } = finance([]);
    await expect(
      target.uploadReceipt(
        tenant,
        'foreign-transaction',
        '/uploads/new.pdf',
        'actor-a',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.query).toHaveBeenCalledTimes(1);
    expect(manager.query.mock.calls[0][1]).toEqual([
      'foreign-transaction',
      tenant,
    ]);
  });

  it('keeps both old/new references and replaces only the locked same-tenant transaction', async () => {
    const { target, manager } = finance([{ receipt_url: '/uploads/old.pdf' }]);
    expect(
      await target.uploadReceipt(
        tenant,
        'transaction-a',
        '/uploads/new.pdf',
        'actor-a',
      ),
    ).toEqual({ success: true });
    const args = manager.query.mock.calls.map((call) => call[1]);
    expect(args).toEqual([
      ['transaction-a', tenant],
      [tenant, 'transaction-a', '/uploads/old.pdf'],
      [tenant, 'transaction-a', '/uploads/new.pdf', 'actor-a'],
      ['transaction-a', tenant, '/uploads/new.pdf'],
    ]);
    expect(manager.query.mock.calls.at(-1)![0]).toContain(
      '(tenant_id=$2 OR tenant_id IS NULL)',
    );
  });
});
