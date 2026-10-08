import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { InvoiceIntegrityService } from './invoice-integrity.service';

const actor = {
  user_id: '10000000-0000-4000-8000-000000000001',
  tenant_id: '20000000-0000-4000-8000-000000000001',
  role: 'APManager',
};
const canonicalId = '30000000-0000-4000-8000-000000000001';
const row = {
  integrity_case_id: canonicalId,
  tenant_id: actor.tenant_id,
  invoice_id: '40000000-0000-4000-8000-000000000001',
  proc_case_id: '50000000-0000-4000-8000-000000000001',
  invoice_revision: 1,
  document_hash: 'document-hash',
  invoice_type: 'OFFLINE_MANUAL',
  department_id: 4,
  workflow_state: 'QUEUED',
  aggregate_revision: 2,
  next_event_sequence: 1,
};

describe('Module 3 canonical case context', () => {
  it.each([canonicalId, row.invoice_id, row.proc_case_id, 'ACQ-2026-000007'])(
    'runs analysis with canonical child keys after resolving %s',
    async (alias) => {
      const manager = {
        query: jest.fn(async (sql: string, params: unknown[]) => {
          if (
            sql.includes('FROM inv_integrity_cases') &&
            sql.includes('FOR UPDATE')
          )
            return params[0] === canonicalId ? [{ ...row }] : [];
          if (sql.includes('FROM proc_invoices'))
            return [
              {
                revision: 1,
                document_hash: row.document_hash,
                category: 'IT',
                total_amount: 100,
                currency: 'INR',
              },
            ];
          if (sql.includes('FROM inv_integrity_policies'))
            return [
              {
                integrity_policy_id: 'policy',
                policy_version: 1,
                required_evidence: ['INVOICE'],
                factor_weights: {
                  SOURCE_DISCREPANCY: 20,
                  PRICE_DEVIATION: 10,
                  DOCUMENT_ANOMALY: 20,
                  PRODUCT_ORDER_MISMATCH: 10,
                  VENDOR_HISTORY: 10,
                  MISSING_EVIDENCE: 10,
                  PURCHASING_PATTERN: 10,
                  REPEATED_DISCREPANCIES: 10,
                },
                automated_min_coverage: 100,
                automated_min_confidence: 100,
              },
            ];
          return [];
        }),
      };
      const query = jest.fn(async (sql: string) =>
        sql.includes('FROM acq_access_grants')
          ? [{ scope_type: 'TENANT' }]
          : [{ ...row }],
      );
      const service = new InvoiceIntegrityService(
        {
          query,
          transaction: (work: (manager: unknown) => unknown) => work(manager),
        } as unknown as DataSource,
        { dispatch: jest.fn() } as never,
      );
      await expect(
        service.analyze(actor, alias, 2, {}, 'analysis-key'),
      ).resolves.toMatchObject({ analysis_result: 'OFFLINE_ANALYZED' });
      expect(query.mock.calls[1][0]).toContain('ar.acquisition_number=$1');
      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM inv_integrity_cases'),
        [canonicalId, actor.tenant_id],
      );
      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO inv_document_analyses'),
        expect.arrayContaining([canonicalId]),
      );
      for (const [sql, params] of manager.query.mock.calls) {
        if (
          /FROM inv_(source_snapshots|market_observations|evidence)/.test(sql)
        )
          expect(params[0]).toBe(canonicalId);
      }
    },
  );

  it('reports missing analysis permission for a visible case, not a missing case', async () => {
    const query = jest.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('FROM acq_access_grants'))
        return params[1] === 'INVOICE_INTEGRITY_VIEW'
          ? [{ scope_type: 'TENANT' }]
          : [];
      return [{ ...row }];
    });
    const service = new InvoiceIntegrityService(
      { query } as unknown as DataSource,
      {} as never,
    );
    await expect(
      service.analyze(actor, canonicalId, 2, {}, 'key'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('still hides cross-scope cases when analysis permission is absent', async () => {
    const service = new InvoiceIntegrityService(
      { query: jest.fn().mockResolvedValue([]) } as unknown as DataSource,
      {} as never,
    );
    await expect(
      service.analyze(actor, canonicalId, 2, {}, 'key'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
