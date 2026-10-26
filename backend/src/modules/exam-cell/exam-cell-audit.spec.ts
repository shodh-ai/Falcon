import { ExamCellAuditService } from './exam-cell-audit.service';

describe('ExamCellAuditService transactional logging', () => {
  const payload = {
    action: 'EXAM_SESSION_CREATED',
    resource_type: 'exam_session',
    resource_id: 'session-a',
    new_value: { status: 'DRAFT' },
  };

  it('uses the supplied transaction manager rather than the global connection', async () => {
    const db = { query: jest.fn() };
    const manager = { query: jest.fn().mockResolvedValue([]) };
    const audit = new ExamCellAuditService(db as never);

    await audit.log('tenant-a', 'actor-a', payload, manager as never);

    expect(db.query).not.toHaveBeenCalled();
    expect(manager.query.mock.calls[0][0]).toContain('clock_timestamp()');
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO exam_audit_logs'),
      [
        'tenant-a',
        'actor-a',
        payload.action,
        payload.resource_type,
        'session-a',
        null,
        JSON.stringify(payload.new_value),
        null,
      ],
    );
  });

  it('propagates a transaction-bound audit failure to roll back the action', async () => {
    const db = { query: jest.fn() };
    const manager = {
      query: jest.fn().mockRejectedValue(new Error('audit unavailable')),
    };
    const audit = new ExamCellAuditService(db as never);

    await expect(
      audit.log('tenant-a', 'actor-a', payload, manager as never),
    ).rejects.toThrow('audit unavailable');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('preserves the existing best-effort behavior without a transaction manager', async () => {
    const db = {
      query: jest.fn().mockRejectedValue(new Error('audit unavailable')),
    };
    const audit = new ExamCellAuditService(db as never);

    await expect(
      audit.log('tenant-a', 'actor-a', payload),
    ).resolves.toBeUndefined();
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('preserves optional actor and payload fields for existing callers', async () => {
    const db = { query: jest.fn().mockResolvedValue([]) };
    const audit = new ExamCellAuditService(db as never);

    await audit.log('tenant-a', undefined, {
      action: 'READ',
      resource_type: 'exam_session',
    });

    expect(db.query).toHaveBeenCalledWith(expect.any(String), [
      'tenant-a',
      null,
      'READ',
      'exam_session',
      null,
      null,
      null,
      null,
    ]);
  });
});
