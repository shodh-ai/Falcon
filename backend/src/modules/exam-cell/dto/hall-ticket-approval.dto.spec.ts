import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  AdvanceHallTicketApprovalDto,
  BulkApproveHallTicketsDto,
} from './hall-ticket-approval.dto';

const session = '11111111-1111-4111-8111-111111111111';
const approval = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const options = { whitelist: true, forbidNonWhitelisted: true };

describe('hall-ticket approval DTO boundaries', () => {
  it('accepts only a server-controlled action with an optional valid reason', () => {
    for (const input of [
      { action: 'APPROVE' },
      { action: 'APPROVE', reason: 'Verified current prerequisites' },
      { action: 'REJECT', reason: 'Registration evidence requires review' },
    ]) {
      expect(
        validateSync(
          plainToInstance(AdvanceHallTicketApprovalDto, input),
          options,
        ),
      ).toEqual([]);
    }
  });

  it('trims the rejection reason', () => {
    const input = plainToInstance(AdvanceHallTicketApprovalDto, {
      action: 'REJECT',
      reason: '  Required document missing  ',
    });
    expect(validateSync(input, options)).toEqual([]);
    expect(input.reason).toBe('Required document missing');
  });

  it.each([
    {},
    { action: 'APPROVED' },
    { action: 'REJECT' },
    { action: 'REJECT', reason: '  ' },
    { action: 'REJECT', reason: 'ab' },
    { action: 'REJECT', reason: 'x'.repeat(2001) },
    { action: 'REJECT', reason: null },
    { action: 'APPROVE', reason: 1 },
    { action: 'APPROVE', stage: 'APPROVED' },
    { action: 'APPROVE', target_stage: 'COE' },
    { action: 'APPROVE', approved_by: approval },
    { action: 'APPROVE', tenant_id: session },
    { action: 'APPROVE', role: 'ExamCell' },
    { action: 'APPROVE', policy_confirmed: true },
  ])('rejects invalid or client-controlled individual input %p', (input) => {
    expect(
      validateSync(
        plainToInstance(AdvanceHallTicketApprovalDto, input),
        options,
      ).length,
    ).toBeGreaterThan(0);
  });

  it('accepts an explicit session and nonempty approval IDs', () => {
    expect(
      validateSync(
        plainToInstance(BulkApproveHallTicketsDto, {
          session_id: session,
          approval_ids: [approval],
        }),
        options,
      ),
    ).toEqual([]);
  });

  it.each([
    {},
    { session_id: session, approval_ids: [] },
    { session_id: 'not-a-session', approval_ids: [approval] },
    { session_id: session, approval_ids: ['not-an-approval'] },
    { session_id: session, approval_ids: approval },
    { session_id: session, approval_ids: [null] },
    { session_id: session, approval_ids: [approval, approval] },
    {
      session_id: session,
      approval_ids: [approval, approval.toUpperCase()],
    },
    {
      session_id: session,
      approval_ids: [approval],
      target_stage: 'APPROVED',
    },
    {
      session_id: session,
      approval_ids: [approval],
      batch_label: 'Not an authorization relationship',
    },
  ])(
    'rejects ambiguous, duplicate or client-targeted bulk input %p',
    (input) => {
      expect(
        validateSync(plainToInstance(BulkApproveHallTicketsDto, input), options)
          .length,
      ).toBeGreaterThan(0);
    },
  );

  it('bounds batch size without removing the unique-ID requirement', () => {
    const ids = Array.from(
      { length: 101 },
      (_, index) =>
        `${index.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`,
    );
    const input = plainToInstance(BulkApproveHallTicketsDto, {
      session_id: session,
      approval_ids: ids,
    });
    expect(validateSync(input, options).map((error) => error.property)).toEqual(
      ['approval_ids'],
    );
    input.approval_ids = ids.slice(0, 100);
    expect(validateSync(input, options)).toEqual([]);
  });
});
