import {
  assertHallTicketStageRole,
  hallTicketWorkflowAvailability,
  HALL_TICKET_STAGE_ROLES,
} from './hall-ticket-policy';
import {
  planHallTicketApprovalTransition,
  validateHallTicketApprovalCommand,
  type HallTicketApprovalState,
} from './hall-ticket-transition';

const tenant = '11111111-1111-4111-8111-111111111111';
const pending = (): HallTicketApprovalState => ({
  stage: 'ELIGIBILITY',
  eligibility_status: 'PENDING',
  finance_status: 'PENDING',
  exam_office_status: 'PENDING',
  coe_status: 'PENDING',
  approved_by: null,
  approved_at: null,
  block_reasons: [],
});
const finance = (): HallTicketApprovalState => ({
  ...pending(),
  stage: 'FINANCE',
  eligibility_status: 'APPROVED',
});
const coe = (): HallTicketApprovalState => ({
  ...finance(),
  stage: 'COE',
  finance_status: 'APPROVED',
  exam_office_status: 'APPROVED',
});

// Pure validation only: not an actual approval, issuance or lock/concurrency test.
describe('hall-ticket server-controlled transition planning', () => {
  it.each<[HallTicketApprovalState, string, string, boolean]>([
    [pending(), 'FINANCE', 'eligibility_status', false],
    [finance(), 'EXAM_OFFICE', 'finance_status', false],
    [
      { ...finance(), stage: 'EXAM_OFFICE', finance_status: 'APPROVED' },
      'COE',
      'exam_office_status',
      false,
    ],
    [coe(), 'APPROVED', 'coe_status', true],
  ])(
    'derives only the next stage from the consistent stored state %p',
    (current, stage, status_column, final) => {
      const before = structuredClone(current);
      expect(
        planHallTicketApprovalTransition(current, { action: 'APPROVE' }),
      ).toMatchObject({
        current_stage: current.stage,
        stage,
        status_column,
        status: 'APPROVED',
        final,
      });
      expect(current).toEqual(before);
    },
  );

  it('requires a recorded rejection reason without treating rejection as final approval', () => {
    expect(
      planHallTicketApprovalTransition(finance(), {
        action: 'REJECT',
        reason: '  Clearance evidence requires review  ',
      }),
    ).toEqual({
      current_stage: 'FINANCE',
      stage: 'REJECTED',
      status_column: 'finance_status',
      status: 'REJECTED',
      final: false,
      action: 'REJECT',
      reason: 'Clearance evidence requires review',
    });
  });

  it.each(['REGISTRATION', 'APPROVED', 'REJECTED', 'UNKNOWN', ''])(
    'rejects legacy, terminal or unsupported stage %s',
    (stage) => {
      expect(() =>
        planHallTicketApprovalTransition(
          { ...pending(), stage },
          { action: 'APPROVE' },
        ),
      ).toThrow('legacy and terminal records require review');
    },
  );

  it.each([
    { ...finance(), eligibility_status: 'PENDING' },
    { ...finance(), finance_status: 'APPROVED' },
    { ...finance(), exam_office_status: 'APPROVED' },
    { ...finance(), coe_status: 'APPROVED' },
    { ...finance(), finance_status: 'REJECTED' },
    { ...finance(), finance_status: '' },
    { ...finance(), approved_by: tenant },
    { ...finance(), approved_at: '2026-10-24T00:00:00Z' },
    { ...finance(), block_reasons: null },
    { ...finance(), block_reasons: {} },
    { ...finance(), block_reasons: [42] },
    { ...finance(), block_reasons: [' '] },
  ])('rejects internally inconsistent approval records %p', (current) => {
    expect(() =>
      planHallTicketApprovalTransition(current, { action: 'APPROVE' }),
    ).toThrow('inconsistent');
  });

  it('does not approve recorded blockers, but permits authorized rejection planning', () => {
    const current = { ...finance(), block_reasons: ['Pending fee clearance'] };
    expect(() =>
      planHallTicketApprovalTransition(current, { action: 'APPROVE' }),
    ).toThrow('Resolve the recorded');
    expect(
      planHallTicketApprovalTransition(current, {
        action: 'REJECT',
        reason: 'Fee clearance denied',
      }).stage,
    ).toBe('REJECTED');
  });

  it.each([
    null,
    undefined,
    [],
    {},
    { action: 'APPROVED' },
    { action: 'REJECT' },
    { action: 'REJECT', reason: ' ' },
    { action: 'APPROVE', reason: null },
    { action: 'APPROVE', reason: 'x'.repeat(2001) },
    { action: 'APPROVE', stage: 'COE' },
    { action: 'APPROVE', target_stage: 'APPROVED' },
    { action: 'APPROVE', approved_by: tenant },
    { action: 'APPROVE', role: 'ExamCell' },
    { action: 'APPROVE', tenant_id: tenant },
  ])('rejects malformed or caller-controlled commands %p', (input) => {
    expect(() => validateHallTicketApprovalCommand(input)).toThrow();
  });
});

describe('hall-ticket confirmed role assignments stay fail-closed', () => {
  it('records only confirmed assignments and never enables the global writer', () => {
    expect(HALL_TICKET_STAGE_ROLES).toEqual({
      ELIGIBILITY: null,
      FINANCE: 'Accountant',
      EXAM_OFFICE: null,
      COE: 'ExamCell',
    });
    expect(hallTicketWorkflowAvailability()).toMatchObject({
      can_issue: false,
      can_approve: false,
    });
  });

  it.each([
    ['FINANCE', 'Accountant'],
    ['FINANCE', ' accountant '],
    ['COE', 'ExamCell'],
  ] as const)('allows only the confirmed %s stage role %s', (stage, role) => {
    expect(() => assertHallTicketStageRole(tenant, stage, role)).not.toThrow();
  });

  it.each([
    'SuperAdmin',
    'CampusAdmin',
    'DeputyCOE',
    'ExamAdmin',
    'ExamOperator',
    'Faculty',
    undefined,
  ])(
    'does not promote %s into Finance or final COE stage authority',
    (role) => {
      for (const stage of ['FINANCE', 'COE'] as const) {
        try {
          assertHallTicketStageRole(tenant, stage, role);
          throw new Error('Expected stage authorization to reject the actor');
        } catch (error: unknown) {
          expect(error).toMatchObject({ status: 403 });
        }
      }
    },
  );

  it.each(['ELIGIBILITY', 'EXAM_OFFICE'] as const)(
    'keeps unconfirmed %s authority blocked for every existing officer role',
    (stage) => {
      for (const role of [
        'ExamCell',
        'Accountant',
        'ExamAdmin',
        'DeputyCOE',
        'SuperAdmin',
      ]) {
        expect(() => assertHallTicketStageRole(tenant, stage, role)).toThrow(
          'not confirmed',
        );
      }
      expect(() =>
        assertHallTicketStageRole(tenant, stage, 'ExamOperator'),
      ).toThrow('cannot approve hall tickets');
    },
  );

  it.each(['', '  ', 'not-a-tenant', undefined])(
    'rejects invalid authenticated tenant %p even for the confirmed stage role',
    (value) => {
      expect(() =>
        assertHallTicketStageRole(value as never, 'FINANCE', 'Accountant'),
      ).toThrow('Valid authenticated tenant context required');
    },
  );

  it('rejects a fabricated current stage rather than selecting a fallback role', () => {
    expect(() =>
      assertHallTicketStageRole(tenant, 'APPROVED' as never, 'ExamCell'),
    ).toThrow('current approval stage');
  });
});
