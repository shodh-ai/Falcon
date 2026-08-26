/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await -- Stateful transactional database mock models row-lock serialization */
import type { DataSource } from 'typeorm';
import type { DofaEngineService } from '../dofa-engine/dofa-engine.service';
import { AcquisitionService } from './acquisition.service';

describe('Acquisition budget reservation concurrency', () => {
  it('serializes competing reservations and never overspends the funding source', async () => {
    const versions: Record<string, { status: string }> = {
      'version-1': { status: 'VENDOR_REVIEW' },
      'version-2': { status: 'VENDOR_REVIEW' },
    };
    const fund = {
      allocated_amount: 1500,
      utilized_amount: 0,
      encumbered_amount: 0,
    };
    let activeVersion = '';
    let reservationSequence = 0;
    const manager = {
      query: jest
        .fn()
        .mockImplementation(async (sql: string, params?: unknown[]) => {
          if (
            sql.includes('FROM acq_request_versions') &&
            sql.includes('FOR UPDATE')
          ) {
            activeVersion = String(params?.[0]);
            return [{ ...versions[activeVersion] }];
          }
          if (
            sql.includes('FROM fin_dept_budgets') &&
            sql.includes('FOR UPDATE')
          ) {
            return [{ ...fund }];
          }
          if (sql.includes("SET status='BUDGET_BLOCKED'")) {
            versions[String(params?.[0])].status = 'BUDGET_BLOCKED';
            return [];
          }
          if (sql.includes('FROM acq_operational_policies'))
            return [{ reservation_days: 14 }];
          if (sql.includes('UPDATE fin_dept_budgets SET encumbered_amount')) {
            fund.encumbered_amount += Number(params?.[1]);
            return [];
          }
          if (sql.includes('INSERT INTO acq_budget_reservations')) {
            reservationSequence += 1;
            return [
              {
                budget_reservation_id: `reservation-${reservationSequence}`,
                acquisition_version_id: activeVersion,
                expires_at: '2099-01-15T00:00:00Z',
              },
            ];
          }
          if (sql.includes("SET status='BUDGET_RESERVED'")) {
            versions[String(params?.[0])].status = 'BUDGET_RESERVED';
            return [];
          }
          if (sql.includes("SET status='PENDING_DOFA'")) {
            versions[String(params?.[0])].status = 'PENDING_DOFA';
            return [];
          }
          if (sql.includes('SELECT event_hash')) return [];
          return [];
        }),
    };
    let transactionQueue: Promise<unknown> = Promise.resolve();
    const db = {
      query: jest.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('FROM dofa_policy_graphs'))
          return [{ graph_id: 'graph-1', version: 1 }];
        if (sql.includes('FROM dofa_matrices')) {
          return [
            {
              required_signatures: 1,
              exception_escalate_role: 'Dean',
              rule_key: 'L1',
              amount_min: 0,
              amount_max: 50000,
            },
          ];
        }
        return [];
      }),
      transaction: jest
        .fn()
        .mockImplementation(
          (callback: (value: typeof manager) => Promise<unknown>) => {
            const task = transactionQueue.then(() => callback(manager));
            transactionQueue = task.then(
              () => undefined,
              () => undefined,
            );
            return task;
          },
        ),
    };
    const dofa = {
      openCase: jest
        .fn()
        .mockImplementation(
          async (_tenant: string, input: { source_id: string }) => ({
            case_id: `case-${input.source_id}`,
            matrix_id: 'matrix-1',
            steps: [{ step_no: 0, required_role: 'HOD' }],
          }),
        ),
    };
    const service = new AcquisitionService(
      db as unknown as DataSource,
      dofa as unknown as DofaEngineService,
    );
    const internal = service as unknown as {
      reserveBudgetAndOpenDofa(
        actor: { user_id: string; tenant_id: string },
        row: Record<string, unknown>,
      ): Promise<void>;
    };
    const actor = { user_id: 'procurement-user', tenant_id: 'tenant-1' };
    const base = {
      acquisition_number: 'ACQ-2099',
      requester_id: 'requester',
      funding_source_type: 'DEPARTMENT',
      funding_source_id: 'fund-1',
      estimated_total: 1000,
      snapshot_hash: 'a'.repeat(64),
    };

    await Promise.all([
      internal.reserveBudgetAndOpenDofa(actor, {
        ...base,
        acquisition_id: 'acq-1',
        acquisition_version_id: 'version-1',
      }),
      internal.reserveBudgetAndOpenDofa(actor, {
        ...base,
        acquisition_id: 'acq-2',
        acquisition_version_id: 'version-2',
      }),
    ]);

    expect(fund.encumbered_amount).toBe(1000);
    expect(
      Object.values(versions)
        .map((item) => item.status)
        .sort(),
    ).toEqual(['BUDGET_BLOCKED', 'PENDING_DOFA']);
    expect(dofa.openCase).toHaveBeenCalledTimes(1);
    expect(reservationSequence).toBe(1);
  });

  it('releases expired encumbrances and marks the acquisition expired', async () => {
    const fund = { encumbered_amount: 1000 };
    let event = 'RESERVED';
    let versionStatus = 'PENDING_DOFA';
    const manager = {
      query: jest
        .fn()
        .mockImplementation(async (sql: string, params?: unknown[]) => {
          if (
            sql.includes('FROM acq_budget_reservations r') &&
            sql.includes('FOR UPDATE')
          ) {
            return [
              {
                budget_reservation_id: 'reservation-1',
                acquisition_version_id: 'version-1',
                funding_source_type: 'DEPARTMENT',
                funding_source_id: 'fund-1',
                amount: 1000,
                tenant_id: 'tenant-1',
              },
            ];
          }
          if (sql.includes('SELECT event_type')) return [{ event_type: event }];
          if (sql.includes('UPDATE fin_dept_budgets')) {
            fund.encumbered_amount = Math.max(
              0,
              fund.encumbered_amount - Number(params?.[1]),
            );
          }
          if (sql.includes('INSERT INTO acq_budget_reservation_events'))
            event = 'EXPIRED';
          if (sql.includes("SET status='EXPIRED'")) versionStatus = 'EXPIRED';
          return [];
        }),
    };
    const db = {
      query: jest
        .fn()
        .mockResolvedValue([{ acquisition_version_id: 'version-1' }]),
      transaction: jest
        .fn()
        .mockImplementation(async (callback) => callback(manager)),
    };
    const service = new AcquisitionService(
      db as unknown as DataSource,
      {} as DofaEngineService,
    );

    await expect(service.expireDueReservations()).resolves.toBe(1);
    expect(fund.encumbered_amount).toBe(0);
    expect(event).toBe('EXPIRED');
    expect(versionStatus).toBe('EXPIRED');
  });
});
