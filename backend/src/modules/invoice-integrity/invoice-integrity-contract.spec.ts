import { readFileSync } from 'fs';
import { join } from 'path';

const integrity = readFileSync(
  join(
    process.cwd(),
    'src/modules/invoice-integrity/invoice-integrity.service.ts',
  ),
  'utf8',
);
const procurement = readFileSync(
  join(process.cwd(), 'src/modules/procurements/procurement.service.ts'),
  'utf8',
);

describe('Module 3 authority and event contracts', () => {
  it.each([
    'InvoiceIntegrityCaseOpened.v1',
    'InvoiceSourceRetrieved.v1',
    'InvoiceIntegrityAnalyzed.v1',
    'InvoiceEvidenceRequested.v1',
    'InvoiceIntegrityCleared.v1',
    'InvoiceIntegrityRejected.v1',
    'InvoiceIntegrityReconsiderationOpened.v1',
  ])('publishes %s through the integrity outbox', (event) => {
    expect(integrity).toContain(event);
  });

  it('keeps procurement events semantically distinct', () => {
    expect(procurement).toContain('ProcurementInvoiceSubmitted.v1');
    expect(procurement).toContain('ProcurementInvoiceMatched.v1');
    expect(procurement).toContain('ProcurementInvoicePaymentEligible.v1');
  });

  it('rechecks exact current integrity evidence inside payment transaction', () => {
    expect(procurement).toContain('projection.invoice_revision');
    expect(procurement).toContain('projection.document_hash');
    expect(procurement).toContain('projection.superseded_at');
    expect(procurement).toContain('INVOICE_INTEGRITY_CLEARANCE_REQUIRED');
    expect(procurement).toContain('SOD_INTEGRITY_PAYMENT_VIOLATION');
    expect(procurement).toContain('invalidateIntegrityClearance');
  });

  it('does not let Module 3 post financial state', () => {
    expect(integrity).not.toContain('INSERT INTO proc_payments');
    expect(integrity).not.toContain('proc_financial_ledger');
    expect(integrity).not.toContain('encumbered_amount');
  });

  it('does not use AI as an authority', () => {
    expect(integrity).toContain("ai_status: 'NOT_USED'");
    expect(integrity).not.toMatch(/ai.*CLEARED_AUTOMATED/i);
  });
});
