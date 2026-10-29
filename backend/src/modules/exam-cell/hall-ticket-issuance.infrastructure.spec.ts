import { DataSource } from 'typeorm';
import { HallTicketIssuanceInfrastructure } from './hall-ticket-issuance.infrastructure';
import { ExamCellAuditService } from './exam-cell-audit.service';

describe('issuance persistence error classification (mocked transaction)', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const scope = {
    tenant: id,
    student: id,
    actor: id,
    session: id,
    window: id,
    registration: id,
    approval: id,
  };
  function setup(error: unknown) {
    const transaction = jest.fn().mockRejectedValue(error);
    const db = { transaction } as unknown as DataSource;
    return {
      transaction,
      service: new HallTicketIssuanceInfrastructure(
        db,
        new ExamCellAuditService(db),
      ),
    };
  }
  it('maps only the official student/session unique constraint to a reconciliation conflict', async () => {
    const { service } = setup({
      code: '23505',
      constraint: 'uq_hall_issued_student_session',
    });
    await expect(
      service.transaction(scope, () => Promise.resolve()),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('preserves unrelated database failures rather than hiding them as retries', async () => {
    const error = { code: '23505', constraint: 'another_constraint' };
    await expect(
      setup(error).service.transaction(scope, () => Promise.resolve()),
    ).rejects.toBe(error);
  });
  it('rejects missing scope before obtaining a transaction', async () => {
    const { service, transaction } = setup(new Error('must not connect'));
    await expect(
      service.transaction({ ...scope, tenant: '' }, () => Promise.resolve()),
    ).rejects.toMatchObject({ status: 400 });
    expect(transaction).not.toHaveBeenCalled();
  });
});
