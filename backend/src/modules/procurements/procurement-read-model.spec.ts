import type { DataSource } from 'typeorm';
import type { ProcurementActor } from './procurement.types';
import { ProcurementService } from './procurement.service';

describe('ProcurementService read-model isolation', () => {
  const actor: ProcurementActor = {
    user_id: '10000000-0000-4000-8000-000000000003',
    tenant_id: 'a0000000-0000-4000-8000-000000000001',
    roles: ['qa_procurement_officer'],
  };

  function serviceWithProjectionFailure(error: Error & { code?: string }) {
    const query = jest.fn((sql: string) => {
      if (sql.includes('FROM acq_access_grants')) {
        return Promise.resolve([
          { scope_type: 'TENANT', scope_reference: null },
        ]);
      }
      if (sql.includes('FROM proc_cases')) {
        return Promise.resolve([
          {
            proc_case_id: 'case-1',
            tenant_id: actor.tenant_id,
            acquisition_number: 'ACQ-2026-000001',
            currency: 'INR',
            aggregate_revision: 1,
            status: 'ACTIVE',
            approved_allocation: 1000,
            available_amount: 1000,
            committed_amount: 0,
            expended_amount: 0,
            released_amount: 0,
          },
        ]);
      }
      if (sql.includes('proc_invoice_integrity_projections'))
        return Promise.reject(error);
      return Promise.resolve([]);
    });
    const service = new ProcurementService({ query } as unknown as DataSource);
    return { service, query };
  }

  it('keeps Module 2 cases readable before the optional Module 3 projection exists', async () => {
    const missingProjection = Object.assign(
      new Error('relation proc_invoice_integrity_projections does not exist'),
      { code: '42P01' },
    );
    const { service } = serviceWithProjectionFailure(missingProjection);

    await expect(service.get(actor, 'case-1')).resolves.toMatchObject({
      proc_case_id: 'case-1',
      integrity_projections: [],
      verified_unpaid_liability: 0,
    });
  });

  it('does not hide unexpected projection query failures', async () => {
    const failure = Object.assign(new Error('database offline'), {
      code: '08006',
    });
    const { service } = serviceWithProjectionFailure(failure);

    await expect(service.get(actor, 'case-1')).rejects.toBe(failure);
  });
});
