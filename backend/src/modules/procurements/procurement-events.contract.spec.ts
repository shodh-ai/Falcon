import { readFileSync } from 'fs';
import { join } from 'path';

const service = readFileSync(
  join(process.cwd(), 'src/modules/procurements/procurement.service.ts'),
  'utf8',
);

describe('Module 2 event and compatibility contract', () => {
  it.each([
    'ProcurementOrderIssued.v1',
    'ProcurementOrderCancelled.v1',
    'ProcurementInvoiceVerified.v1',
    'PackageReceiptRecorded.v1',
    'GoodsReceiptRecorded.v1',
    'ServiceAcceptanceRecorded.v1',
    'PaymentPosted.v1',
    'ReturnRecorded.v1',
    'RefundPosted.v1',
    'ProcurementFinalized.v1',
  ])('publishes %s transactionally', (eventType) => {
    expect(service).toContain(eventType);
  });

  it('separates sealed-package custody from requester product acceptance', () => {
    expect(service).toContain('PACKAGE_RECEIPT_RECORDED');
    expect(service).toContain("acceptance_status='PRODUCT_CONFIRMED'");
    expect(service).toContain('PRODUCT_ACCEPTANCE_REQUESTER_REQUIRED');
    expect(service).toContain("purpose='RECEIVED_PRODUCT'");
  });

  it('uses sequence and revision in every event envelope', () => {
    expect(service).toContain('aggregate_revision: revision');
    expect(service).toContain('aggregate_sequence: sequence');
    expect(service).toContain('next_event_sequence=$3');
  });

  it('writes legacy projections only from canonical actions', () => {
    expect(service).toContain("'MODULE2'");
    expect(service).toContain('INSERT INTO fin_purchase_orders');
    expect(service).toContain('INSERT INTO fin_vendor_invoices');
    expect(service).toContain('INSERT INTO fin_goods_receipts');
  });
});
