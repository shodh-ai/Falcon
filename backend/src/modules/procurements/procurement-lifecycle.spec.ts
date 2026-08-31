/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await -- focused query mocks exercise lifecycle gates */
import { BadRequestException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { ProcurementService } from './procurement.service';
import { hash } from './procurement.util';

const tenant = '20000000-0000-4000-8000-000000000001';
const eventId = '10000000-0000-4000-8000-000000000001';
const payload = {
  event_id: eventId,
  event_version: 1,
  acquisition_id: '30000000-0000-4000-8000-000000000001',
  acquisition_version_id: '40000000-0000-4000-8000-000000000001',
  acquisition_number: 'ACQ-2026-001',
  version_number: 1,
  tenant,
  requester: '50000000-0000-4000-8000-000000000001',
  department: 5,
  budget_reservation: {
    budget_reservation_id: '60000000-0000-4000-8000-000000000001',
  },
  approved_amount: 1000,
  currency: 'INR',
  snapshot_hash: 'a'.repeat(64),
  approved_at: '2026-08-26T00:00:00.000Z',
  lines: [
    {
      line_id: '70000000-0000-4000-8000-000000000001',
      product: 'Laboratory equipment',
      category: 'Equipment',
      quantity: 2,
      unit: 'unit',
      selected_vendor: '80000000-0000-4000-8000-000000000001',
      estimated_unit_price: 500,
      estimated_cost: 1000,
      asset_classification: 'ASSET',
    },
  ],
};

describe('Module 2 lifecycle', () => {
  it('consumes a valid approved acquisition exactly once with immutable lineage', async () => {
    const caseRow = {
      proc_case_id: '90000000-0000-4000-8000-000000000001',
      tenant_id: tenant,
      acquisition_id: payload.acquisition_id,
      acquisition_version_id: payload.acquisition_version_id,
      acquisition_snapshot_hash: payload.snapshot_hash,
      budget_reservation_id: payload.budget_reservation.budget_reservation_id,
      source_event_id: eventId,
      approved_allocation: 1000,
      available_amount: 1000,
      committed_amount: 0,
      expended_amount: 0,
      released_amount: 0,
      aggregate_revision: 1,
      next_event_sequence: 1,
      currency: 'INR',
    };
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('WHERE source_event_id')) return [];
        if (sql.includes('FROM acq_outbox_events'))
          return [
            {
              event_id: eventId,
              tenant_id: tenant,
              event_type: 'AcquisitionApproved.v1',
              payload,
              payload_hash: hash(payload),
            },
          ];
        if (sql.includes('INSERT INTO proc_cases')) return [caseRow];
        return [];
      }),
    };
    const db = {
      transaction: jest.fn((callback: (value: any) => unknown) =>
        callback(manager),
      ),
    };
    const service = new ProcurementService(db as unknown as DataSource);
    await expect(service.consumeApprovedEvent(eventId)).resolves.toMatchObject({
      acquisition_version_id: payload.acquisition_version_id,
      acquisition_snapshot_hash: payload.snapshot_hash,
      budget_reservation_id: payload.budget_reservation.budget_reservation_id,
      approved_allocation: 1000,
    });
    expect(
      manager.query.mock.calls.filter(([sql]) =>
        String(sql).includes('INSERT INTO proc_case_lines'),
      ),
    ).toHaveLength(1);
    expect(
      manager.query.mock.calls.some(([sql]) =>
        String(sql).includes("'ALLOCATION_ESTABLISHED'"),
      ),
    ).toBe(true);
  });

  it('rejects an approved event whose payload hash cannot be verified', async () => {
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('WHERE source_event_id')) return [];
        if (sql.includes('FROM acq_outbox_events'))
          return [
            {
              event_id: eventId,
              tenant_id: tenant,
              payload,
              payload_hash: '0'.repeat(64),
            },
          ];
        return [];
      }),
    };
    const service = new ProcurementService({
      transaction: (callback: (value: any) => unknown) => callback(manager),
    } as unknown as DataSource);
    await expect(service.consumeApprovedEvent(eventId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('does not require inventory identity for service finalization', async () => {
    const actor = {
      user_id: 'a0000000-0000-4000-8000-000000000001',
      tenant_id: tenant,
      role: 'InternalAuditor',
    };
    const caseRow = {
      proc_case_id: '90000000-0000-4000-8000-000000000001',
      tenant_id: tenant,
      requester_id: payload.requester,
      department_id: 5,
      approved_allocation: 1000,
      available_amount: 0,
      committed_amount: 0,
      expended_amount: 1000,
      released_amount: 0,
      status: 'ACTIVE',
    };
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ scope_type: 'TENANT' }])
      .mockResolvedValueOnce([caseRow])
      .mockResolvedValueOnce([
        {
          proc_case_line_id: 'line-service',
          fulfillment_type: 'SERVICE',
          approved_quantity: 1,
          cancelled_quantity: 0,
          received: 0,
          returned: 0,
          service_accepted: 1,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const service = new ProcurementService({ query } as unknown as DataSource);
    await expect(
      service.finalizationReadiness(actor, caseRow.proc_case_id),
    ).resolves.toMatchObject({
      ready: true,
      line_checks: [
        expect.objectContaining({
          fulfillment_type: 'SERVICE',
          quantity_resolved: true,
          downstream_ready: true,
        }),
      ],
    });
  });

  it('requires physical verification, asset identity and inventory for assets', async () => {
    const actor = {
      user_id: 'a0000000-0000-4000-8000-000000000001',
      tenant_id: tenant,
      role: 'InternalAuditor',
    };
    const caseRow = {
      proc_case_id: '90000000-0000-4000-8000-000000000001',
      tenant_id: tenant,
      requester_id: payload.requester,
      department_id: 5,
      approved_allocation: 1000,
      available_amount: 0,
      committed_amount: 0,
      expended_amount: 1000,
      released_amount: 0,
      status: 'ACTIVE',
    };
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ scope_type: 'TENANT' }])
      .mockResolvedValueOnce([caseRow])
      .mockResolvedValueOnce([
        {
          proc_case_line_id: 'line-asset',
          fulfillment_type: 'ASSET',
          approved_quantity: 1,
          cancelled_quantity: 0,
          received: 1,
          returned: 0,
          service_accepted: 0,
        },
      ])
      // Module 4 inventory gate remains disabled during shadow rollout.
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          proc_case_line_id: 'line-asset',
          status_type: 'PHYSICAL_VERIFICATION',
          status: 'FINALIZED',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const service = new ProcurementService({ query } as unknown as DataSource);
    const readiness = await service.finalizationReadiness(
      actor,
      caseRow.proc_case_id,
    );
    expect(readiness.ready).toBe(false);
    expect(readiness.line_checks[0]).toMatchObject({
      quantity_resolved: true,
      downstream_ready: false,
    });
  });
});
