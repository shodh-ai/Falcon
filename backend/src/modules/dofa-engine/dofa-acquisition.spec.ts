/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await -- Jest database mocks are intentionally dynamic */
import type { DataSource } from 'typeorm';
import type { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { DofaEngineService } from './dofa-engine.service';

describe('DofaEngineService acquisition behavior', () => {
  const db = { query: jest.fn(), transaction: jest.fn() };
  const notify = {};
  let service: DofaEngineService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DofaEngineService(
      db as unknown as DataSource,
      notify as NotificationEmitterService,
    );
  });

  it('materializes every required signature even when a role repeats', async () => {
    const insertedSteps: Array<{ step: number; role: string }> = [];
    db.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('SELECT * FROM dofa_matrices')) {
        return [
          {
            matrix_id: 'matrix-1',
            domain: 'ACQUISITION',
            rule_key: 'TEST',
            amount_min: 0,
            amount_max: null,
            required_roles: ['FinanceController'],
            required_signatures: 3,
            exception_escalate_role: 'Chairman',
          },
        ];
      }
      if (sql.includes('INSERT INTO dofa_cases')) {
        return [
          {
            case_id: 'case-1',
            tenant_id: 'tenant-1',
            domain: 'ACQUISITION',
            status: 'PENDING',
            current_step: 0,
          },
        ];
      }
      if (sql.includes('INSERT INTO dofa_case_steps')) {
        insertedSteps.push({
          step: Number(params?.[1]),
          role: String(params?.[2]),
        });
        return [];
      }
      if (sql.includes('SELECT * FROM dofa_cases')) {
        return [
          {
            case_id: 'case-1',
            tenant_id: 'tenant-1',
            domain: 'ACQUISITION',
            status: 'PENDING',
            current_step: 0,
          },
        ];
      }
      if (sql.includes('SELECT * FROM dofa_case_steps')) {
        return insertedSteps.map(({ step, role }) => ({
          step_no: step,
          required_role: role,
          decision: null,
        }));
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const opened = await service.openCase('tenant-1', {
      domain: 'ACQUISITION',
      title: 'Acquisition approval',
      requester_id: 'requester-1',
      amount: 100,
    });
    expect(insertedSteps).toEqual([
      { step: 0, role: 'FinanceController' },
      { step: 1, role: 'FinanceController' },
      { step: 2, role: 'FinanceController' },
    ]);
    expect(opened.steps).toHaveLength(3);
  });

  it('resolves amount boundaries and preserves finance role aliases', async () => {
    db.query.mockResolvedValueOnce([
      {
        matrix_id: 'l1',
        domain: 'ACQUISITION',
        rule_key: 'L1',
        amount_min: 0,
        amount_max: 50000,
        required_roles: ['HOD'],
        required_signatures: 1,
        exception_escalate_role: 'Dean',
      },
      {
        matrix_id: 'l2',
        domain: 'ACQUISITION',
        rule_key: 'L2',
        amount_min: 50000.01,
        amount_max: 200000,
        required_roles: ['FinanceController'],
        required_signatures: 1,
        exception_escalate_role: 'COO',
      },
    ]);
    await expect(
      service.resolveMatrix('tenant', 'ACQUISITION', 50000),
    ).resolves.toMatchObject({ matrix_id: 'l1' });
    expect(service.roleMatches('FinanceController', 'CFO')).toBe(true);
    expect(service.roleMatches('HOD', 'Faculty')).toBe(false);
  });

  it('publishes the complete immutable approved contract in the approval transaction', async () => {
    db.query.mockResolvedValueOnce([
      {
        budget_reservation_id: 'reservation-1',
        acquisition_version_id: 'version-1',
        latest_event: 'RESERVED',
        expires_at: '2099-01-01T00:00:00Z',
        amount: '1250.00',
        currency: 'INR',
      },
    ]);
    let outboxPayload: Record<string, unknown> | undefined;
    const manager = {
      query: jest
        .fn()
        .mockImplementation(async (sql: string, params?: unknown[]) => {
          if (sql.includes('SELECT v.*, r.acquisition_number'))
            return [
              {
                acquisition_id: 'acquisition-1',
                acquisition_version_id: 'version-1',
                acquisition_number: 'ACQ-2099-000001',
                version_number: 1,
                tenant_id: 'tenant-1',
                requester_id: 'requester-1',
                requesting_department_id: 10,
                intended_lab_or_project: 'Robotics Lab',
                required_by_date: '2099-02-01',
                priority: 'HIGH',
                funding_source_type: 'DEPARTMENT',
                funding_source_id: 'fund-1',
                estimated_total: '1250.00',
                currency: 'INR',
                snapshot_hash: 'b'.repeat(64),
                status: 'PENDING_DOFA',
              },
            ];
          if (sql.includes('FROM acq_lines l'))
            return [
              {
                line_id: 'line-1',
                product_name: 'Controller',
                category: 'Electronics',
                quantity: '1',
                unit: 'unit',
                brand: 'Brand',
                model_number: 'M1',
                part_number: 'P1',
                technical_specifications: { ram: '16GB' },
                intended_use: 'Robotics',
                selected_vendor_id: 'vendor-1',
                recommendation_snapshot: { policy_version: 1 },
                estimated_line_total: '1000',
                delivery_cost: '50',
                tax_cost: '180',
                installation_cost: '20',
                service_cost: '0',
                miscellaneous_cost: '0',
                warranty_requirements: '1 year',
                expected_delivery_days: 7,
                item_classification: 'ASSET',
                special_procurement_requirements: 'Certified installation',
              },
            ];
          if (sql.includes('FROM acq_dofa_route_snapshots'))
            return [{ policy_version: 1, route_snapshot_hash: 'c'.repeat(64) }];
          if (sql.includes('FROM acq_approval_decisions'))
            return [
              {
                decision_id: 'decision-1',
                decision: 'APPROVED',
                decision_hash: 'd'.repeat(64),
              },
            ];
          if (sql.includes('INSERT INTO acq_outbox_events')) {
            outboxPayload = JSON.parse(String(params?.[3])) as Record<
              string,
              unknown
            >;
          }
          return [];
        }),
    };
    db.transaction.mockImplementation(async (callback) => callback(manager));
    const internal = service as unknown as {
      finalizeAcquisition(
        tenantId: string,
        versionId: string,
        outcome: 'APPROVED',
        actorId: string,
      ): Promise<void>;
    };
    await internal.finalizeAcquisition(
      'tenant-1',
      'version-1',
      'APPROVED',
      'approver-1',
    );

    expect(outboxPayload).toMatchObject({
      event_version: 1,
      acquisition_id: 'acquisition-1',
      acquisition_version_id: 'version-1',
      acquisition_number: 'ACQ-2099-000001',
      requester: 'requester-1',
      approved_amount: '1250.00',
      snapshot_hash: 'b'.repeat(64),
      budget_reservation: expect.objectContaining({
        budget_reservation_id: 'reservation-1',
      }),
      dofa: expect.objectContaining({ policy_version: 1 }),
    });
    expect(outboxPayload?.lines).toEqual([
      expect.objectContaining({
        line_id: 'line-1',
        selected_vendor: 'vendor-1',
        estimated_cost: 1250,
      }),
    ]);
    const sql = manager.query.mock.calls
      .map(([statement]) => statement)
      .join('\n');
    expect(sql).toContain("SET status='APPROVED'");
    expect(sql).toContain("'AcquisitionApproved.v1'");
  });

  it('writes an atomic hash-linked decision and blocks the same signer at the next level', async () => {
    let currentStep = 0;
    const steps = [
      { step_no: 0, required_role: 'HOD', decision: null as string | null },
      { step_no: 1, required_role: 'Dean', decision: null as string | null },
    ];
    const decisions: Array<Record<string, unknown>> = [];
    const caseRow = {
      case_id: 'case-1',
      tenant_id: 'tenant-1',
      domain: 'ACQUISITION',
      source_id: 'version-1',
      requester_id: 'requester-1',
      status: 'PENDING',
    };
    db.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('SELECT * FROM dofa_cases'))
        return [{ ...caseRow, current_step: currentStep }];
      if (sql.includes('SELECT * FROM dofa_case_steps')) return steps;
      if (sql.includes('FROM acq_budget_reservations')) {
        return [
          {
            budget_reservation_id: 'reservation-1',
            latest_event: 'RESERVED',
            expires_at: '2099-01-01T00:00:00Z',
          },
        ];
      }
      if (sql.includes('SELECT 1 FROM acq_approval_decisions')) {
        return decisions.some((item) => item.approver_id === params?.[1])
          ? [{}]
          : [];
      }
      if (sql.includes('UPDATE dofa_cases SET current_step')) {
        currentStep = Number(params?.[1]);
        return [];
      }
      return [];
    });
    const manager = {
      query: jest
        .fn()
        .mockImplementation(async (sql: string, params?: unknown[]) => {
          if (sql.includes('UPDATE dofa_case_steps')) {
            const target = steps[Number(params?.[4])];
            if (target.decision) return [];
            target.decision = String(params?.[2]);
            return [[{ step_id: 'step-1' }], 1];
          }
          if (sql.includes('SELECT decision_hash')) {
            return decisions.length
              ? [{ decision_hash: decisions.at(-1)?.decision_hash }]
              : [];
          }
          if (sql.includes('INSERT INTO acq_approval_decisions')) {
            decisions.push({
              approval_level: params?.[3],
              approver_id: params?.[4],
              decision_hash: params?.[9],
              previous_decision_hash: params?.[10],
            });
          }
          return [];
        }),
    };
    db.transaction.mockImplementation(async (callback) => callback(manager));

    await service.decide('tenant-1', 'hod-user', ['HOD', 'Dean'], 'case-1', {
      decision: 'APPROVED',
      notes: 'Budget and need verified',
    });
    expect(decisions).toEqual([
      expect.objectContaining({
        approval_level: 1,
        approver_id: 'hod-user',
        decision_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        previous_decision_hash: null,
      }),
    ]);
    const insertCall = manager.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO acq_approval_decisions'),
    );
    expect(insertCall?.[1]?.[8]).toEqual(expect.any(String));
    expect(currentStep).toBe(1);
    await expect(
      service.decide('tenant-1', 'hod-user', ['Dean'], 'case-1', {
        decision: 'APPROVED',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DISTINCT_SIGNER_REQUIRED' }),
    });
    expect(decisions).toHaveLength(1);
  });
});
