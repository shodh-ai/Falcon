import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(
  join(
    process.cwd(),
    'migrations',
    '20260829120000_dofa_module2_progressive_procurement.sql',
  ),
  'utf8',
);

describe('Module 2 migration contract', () => {
  it.each([
    'proc_cases',
    'proc_case_lines',
    'proc_orders',
    'proc_order_lines',
    'proc_receipts',
    'proc_receipt_lines',
    'proc_service_acceptances',
    'proc_invoices',
    'proc_invoice_lines',
    'proc_match_results',
    'proc_payments',
    'proc_adjustments',
    'proc_returns',
    'proc_repairs',
    'proc_financial_ledger',
    'proc_audit_events',
    'proc_outbox_events',
  ])('creates canonical table %s', (table) => {
    expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  });

  it('enforces allocation conservation and non-negative buckets', () => {
    expect(sql).toContain('proc_case_bucket_conservation');
    expect(sql).toMatch(
      /approved_allocation\s*=\s*available_amount\s*\+\s*committed_amount\s*\+\s*expended_amount\s*\+\s*released_amount/,
    );
    expect(sql).toContain('available_amount NUMERIC(15,2) NOT NULL CHECK');
  });

  it('pins every case to the immutable Module 1 lineage', () => {
    expect(sql).toContain('acquisition_version_id UUID NOT NULL UNIQUE');
    expect(sql).toContain('acquisition_snapshot_hash CHAR(64) NOT NULL');
    expect(sql).toContain('budget_reservation_id UUID NOT NULL UNIQUE');
    expect(sql).toContain('source_event_id UUID NOT NULL UNIQUE');
  });

  it('makes ledger, audit and finalized records immutable', () => {
    expect(sql).toContain('tr_proc_ledger_immutable');
    expect(sql).toContain('tr_proc_audit_immutable');
    expect(sql).toContain('tr_proc_invoice_finalized_immutable');
    expect(sql).toContain('tr_proc_payment_immutable');
  });

  it('supports ordered events and one-way legacy projections', () => {
    expect(sql).toContain('aggregate_sequence BIGINT NOT NULL');
    expect(sql).toContain('UNIQUE (aggregate_id, aggregate_sequence)');
    expect(sql).toContain(
      "source_system VARCHAR(24) NOT NULL DEFAULT 'LEGACY_P2P'",
    );
    expect(sql).toContain('proc_order_id UUID UNIQUE');
    expect(sql).toContain('proc_invoice_id UUID UNIQUE');
    expect(sql).toContain('proc_receipt_id UUID UNIQUE');
  });

  it('seeds zero-tolerance matching and scoped persona capabilities', () => {
    expect(sql).toContain("'*','*','PUBLISHED',0,0,0,0,0");
    expect(sql).toContain("'PROCUREMENT_ORDER_ENTRY'");
    expect(sql).toContain("'PROCUREMENT_RECEIPT_ENTRY'");
    expect(sql).toContain("'PROCUREMENT_INVOICE_VERIFY'");
    expect(sql).toContain("'PROCUREMENT_PAYMENT_POST'");
  });
});
