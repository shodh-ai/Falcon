/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await -- workbook and transaction mocks */
import { ConflictException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { ProcurementImportService } from './procurement-import.service';

const actor = {
  user_id: '10000000-0000-4000-8000-000000000001',
  tenant_id: '20000000-0000-4000-8000-000000000001',
  role: 'SuperAdmin',
};
const caseId = '30000000-0000-4000-8000-000000000001';
const orderId = '40000000-0000-4000-8000-000000000001';

const sheets = {
  Orders: [
    'Action',
    'order_id',
    'external_order_id',
    'order_date',
    'expected_delivery_date',
    'product_url',
  ],
  Invoices: [
    'Action',
    'invoice_id',
    'invoice_date',
    'document_object_key',
    'document_hash',
  ],
  Receipts: ['Action', 'receipt_id', 'actual_delivery_date', 'notes'],
  Adjustments: ['Action', 'adjustment_id', 'reference_number'],
  Returns: ['Action', 'return_id', 'reason'],
};

async function workbook(revision = 1, formula = false) {
  const book = new ExcelJS.Workbook();
  const meta = book.addWorksheet('_Meta');
  meta.addRows([
    ['Template Version', '2.0'],
    ['Procurement Case ID', caseId],
    ['Aggregate Revision', revision],
  ]);
  for (const [name, headers] of Object.entries(sheets)) {
    const sheet = book.addWorksheet(name);
    sheet.addRow(headers);
  }
  const orders = book.getWorksheet('Orders')!;
  orders.addRow([
    'UPDATE',
    orderId,
    formula ? { formula: '1+1', result: 2 } : 'EXT-1',
    '2026-08-26',
    '2026-09-01',
    'https://example.com/order',
  ]);
  return Buffer.from(await book.xlsx.writeBuffer());
}

describe('Module 2 workbook safety', () => {
  afterEach(() => {
    delete process.env.PROCUREMENT_REQUIRE_MALWARE_SCAN;
    delete process.env.PROCUREMENT_CLAMAV_COMMAND;
  });

  it('rejects formula cells instead of trusting cached results', async () => {
    const procurements = {
      authorizeImport: jest.fn().mockResolvedValue({
        tenant_id: actor.tenant_id,
        aggregate_revision: 1,
      }),
    };
    const service = new ProcurementImportService(
      { query: jest.fn() } as unknown as DataSource,
      procurements as any,
    );
    await expect(
      service.preview(actor, caseId, {
        originalname: 'procurement.xlsx',
        buffer: await workbook(1, true),
      } as Express.Multer.File),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FORMULA_CELL_REJECTED' }),
    });
  });

  it('rejects a stale exported revision before accepting changes', async () => {
    const procurements = {
      authorizeImport: jest.fn().mockResolvedValue({
        tenant_id: actor.tenant_id,
        aggregate_revision: 2,
      }),
    };
    const service = new ProcurementImportService(
      { query: jest.fn() } as unknown as DataSource,
      procurements as any,
    );
    await expect(
      service.preview(actor, caseId, {
        originalname: 'procurement.xlsx',
        buffer: await workbook(1),
      } as Express.Multer.File),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('fails closed in production when malware scanning is unavailable', async () => {
    process.env.PROCUREMENT_REQUIRE_MALWARE_SCAN = 'true';
    const procurements = {
      authorizeImport: jest.fn().mockResolvedValue({
        tenant_id: actor.tenant_id,
        aggregate_revision: 1,
      }),
    };
    const service = new ProcurementImportService(
      { query: jest.fn() } as unknown as DataSource,
      procurements as any,
    );
    await expect(
      service.preview(actor, caseId, {
        originalname: 'procurement.xlsx',
        buffer: await workbook(1),
      } as Express.Multer.File),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'MALWARE_SCANNER_UNAVAILABLE',
      }),
    });
  });

  it('does not consume a preview if any atomic update conflicts', async () => {
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM proc_import_previews'))
          return [
            {
              import_preview_id: '50000000-0000-4000-8000-000000000001',
              base_revision: 1,
              changed_rows: 2,
              expires_at: new Date(Date.now() + 60_000),
              parsed_changes: [
                {
                  sheet: 'Orders',
                  id: orderId,
                  values: {
                    external_order_id: 'EXT-1',
                    order_date: '2026-08-26',
                    expected_delivery_date: null,
                    product_url: null,
                  },
                },
                {
                  sheet: 'Orders',
                  id: '60000000-0000-4000-8000-000000000001',
                  values: {
                    external_order_id: 'EXT-2',
                    order_date: '2026-08-26',
                    expected_delivery_date: null,
                    product_url: null,
                  },
                },
              ],
            },
          ];
        if (sql.includes('FROM proc_cases')) return [{ aggregate_revision: 1 }];
        if (sql.startsWith('UPDATE proc_orders')) {
          return manager.query.mock.calls.filter(([query]) =>
            String(query).startsWith('UPDATE proc_orders'),
          ).length === 1
            ? [{ order_id: orderId }]
            : [];
        }
        return [];
      }),
    };
    const db = {
      transaction: jest.fn((callback: (value: any) => unknown) =>
        callback(manager),
      ),
    };
    const procurements = {
      authorizeImport: jest
        .fn()
        .mockResolvedValue({ tenant_id: actor.tenant_id }),
    };
    const service = new ProcurementImportService(
      db as unknown as DataSource,
      procurements as any,
    );
    await expect(
      service.commit(actor, caseId, '50000000-0000-4000-8000-000000000001'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'IMPORT_ATOMIC_CONFLICT' }),
    });
    expect(
      manager.query.mock.calls.some(([sql]) =>
        String(sql).includes('SET consumed_at=NOW()'),
      ),
    ).toBe(false);
  });
});
