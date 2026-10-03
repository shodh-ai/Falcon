import type { DataSource } from 'typeorm';
import { ProcurementService } from './procurement.service';

const actor = {
  user_id: '10000000-0000-4000-8000-000000000001',
  tenant_id: '20000000-0000-4000-8000-000000000001',
  role: 'Stores',
};
const caseId = '30000000-0000-4000-8000-000000000001';
const orderId = '40000000-0000-4000-8000-000000000001';
const poId = '50000000-0000-4000-8000-000000000001';
const row = {
  proc_case_id: caseId,
  tenant_id: actor.tenant_id,
  department_id: 4,
  aggregate_revision: 2,
  next_event_sequence: 1,
  status: 'ACTIVE',
};

describe('Module 2 sealed-package receipt context', () => {
  it.each(['existing', 'repair-existing', 'repair-new'])(
    'preserves canonical case and compatibility PO (%s)',
    async (scenario) => {
      const manager = {
        query: jest.fn(async (sql: string, params: unknown[]) => {
          if (sql.includes('FROM proc_cases') && sql.includes('FOR UPDATE'))
            return params[0] === caseId ? [{ ...row }] : [];
          if (sql.includes('SELECT * FROM proc_orders'))
            return [
              {
                status: 'ISSUED',
                created_by: 'other-operator',
                order_number: 'PO-1',
                vendor_id: 'vendor',
                total_amount: 100,
                legacy_po_id: scenario === 'existing' ? poId : null,
              },
            ];
          if (sql.includes('FROM proc_document_uploads'))
            return [
              {
                capture_latitude: 26,
                capture_longitude: 75,
                capture_accuracy_metres: 10,
                client_captured_at: '2026-10-03T08:00:00Z',
              },
            ];
          if (sql.includes('SELECT po_id FROM fin_purchase_orders'))
            return scenario === 'repair-existing' ? [{ po_id: poId }] : [];
          if (sql.includes('INSERT INTO fin_purchase_orders'))
            return [{ po_id: poId }];
          if (sql.includes('INSERT INTO fin_goods_receipts'))
            return [{ grn_id: 'legacy-grn' }];
          if (sql.includes('SELECT ol.*'))
            return [
              {
                order_line_id: 'line',
                proc_case_line_id: 'case-line',
                quantity: 5,
                cancelled_quantity: 0,
                accepted: 0,
                returned: 0,
              },
            ];
          if (sql.includes('COUNT(*)::int AS count')) return [{ count: 0 }];
          return [];
        }),
      };
      const query = jest.fn(async (sql: string) =>
        sql.includes('FROM acq_access_grants')
          ? [{ scope_type: 'TENANT' }]
          : [{ ...row }],
      );
      const service = new ProcurementService({
        query,
        transaction: (work: (manager: unknown) => unknown) => work(manager),
      } as unknown as DataSource);
      await expect(
        service.recordReceipt(actor, 'ACQ-2026-000007', orderId, 2, {
          actual_delivery_date: '2026-10-03',
          package_evidence_upload_id: 'evidence',
          lines: [
            {
              order_line_id: 'line',
              received_quantity: 5,
              accepted_quantity: 0,
              rejected_quantity: 0,
            },
          ],
        }),
      ).resolves.toMatchObject({ order_status: 'RECEIVED' });
      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM proc_cases'),
        [caseId, actor.tenant_id],
      );
      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO fin_goods_receipts'),
        [actor.tenant_id, poId, actor.user_id, '2026-10-03', null],
      );
      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM proc_document_uploads'),
        ['evidence', caseId, actor.tenant_id, actor.user_id],
      );
      if (scenario === 'repair-existing')
        expect(
          manager.query.mock.calls.some(([sql]) =>
            sql.includes('INSERT INTO fin_purchase_orders'),
          ),
        ).toBe(false);
    },
  );
});
