/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await -- focused mocks exercise query-gated service boundaries */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { ProcurementService } from './procurement.service';

const actor = {
  user_id: '10000000-0000-4000-8000-000000000001',
  tenant_id: '20000000-0000-4000-8000-000000000001',
  role: 'Stores',
};

const caseRow = {
  proc_case_id: '30000000-0000-4000-8000-000000000001',
  tenant_id: actor.tenant_id,
  acquisition_id: '40000000-0000-4000-8000-000000000001',
  acquisition_version_id: '50000000-0000-4000-8000-000000000001',
  budget_reservation_id: '60000000-0000-4000-8000-000000000001',
  requester_id: '70000000-0000-4000-8000-000000000001',
  department_id: 4,
  currency: 'INR',
  approved_allocation: 1000,
  available_amount: 0,
  committed_amount: 1000,
  expended_amount: 0,
  released_amount: 0,
  aggregate_revision: 2,
  next_event_sequence: 1,
  status: 'ACTIVE',
};

describe('Module 2 security boundaries', () => {
  it('returns not found before loading child records for cross-scope access', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { scope_type: 'DEPARTMENT', scope_reference: '9' },
      ])
      .mockResolvedValueOnce([]);
    const service = new ProcurementService({ query } as unknown as DataSource);
    await expect(
      service.get(actor, caseRow.proc_case_id),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(String(query.mock.calls[1][0])).toContain('tenant_id=$2');
    expect(String(query.mock.calls[1][0])).toContain('department_id=ANY');
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('prevents an order creator from receiving their own order', async () => {
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM proc_cases') && sql.includes('FOR UPDATE'))
          return [caseRow];
        if (sql.includes('FROM proc_orders'))
          return [
            {
              order_id: '80000000-0000-4000-8000-000000000001',
              status: 'ISSUED',
              created_by: actor.user_id,
            },
          ];
        return [];
      }),
    };
    const db = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ scope_type: 'TENANT' }])
        .mockResolvedValueOnce([caseRow])
        .mockResolvedValueOnce([{ scope_type: 'TENANT' }]),
      transaction: jest.fn((callback: (value: any) => unknown) =>
        callback(manager),
      ),
    };
    const service = new ProcurementService(db as unknown as DataSource);
    await expect(
      service.recordReceipt(
        actor,
        caseRow.proc_case_id,
        '80000000-0000-4000-8000-000000000001',
        2,
        {
          actual_delivery_date: '2026-08-26',
          lines: [
            {
              order_line_id: '90000000-0000-4000-8000-000000000001',
              received_quantity: 1,
              accepted_quantity: 1,
            },
          ],
        },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SOD_RECEIVER_VIOLATION' }),
    });
  });

  it('prevents invoice entry and verification by the same user', async () => {
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM proc_cases') && sql.includes('FOR UPDATE'))
          return [caseRow];
        if (sql.includes('FROM proc_invoices'))
          return [
            {
              invoice_id: 'a0000000-0000-4000-8000-000000000001',
              status: 'ENTERED',
              entered_by: actor.user_id,
              document_object_key: `${actor.tenant_id}/invoice.pdf`,
              document_scan_status: 'CLEAN',
            },
          ];
        return [];
      }),
    };
    const db = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ scope_type: 'TENANT' }])
        .mockResolvedValueOnce([caseRow])
        .mockResolvedValueOnce([{ scope_type: 'TENANT' }]),
      transaction: jest.fn((callback: (value: any) => unknown) =>
        callback(manager),
      ),
    };
    const service = new ProcurementService(db as unknown as DataSource);
    await expect(
      service.verifyInvoice(
        actor,
        caseRow.proc_case_id,
        'a0000000-0000-4000-8000-000000000001',
        2,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
