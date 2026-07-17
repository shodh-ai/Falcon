import {
  assertNoPendingRow,
  assertNoPendingSql,
} from '../../../backend/src/common/validators/pending-request.util';

describe('pending-request.util', () => {
  it('assertNoPendingRow throws when pending row exists', async () => {
    const repo = {
      count: jest.fn().mockResolvedValue(1),
    };
    await expect(
      assertNoPendingRow(repo as never, { user_id: 'u1', status: 'PENDING' }),
    ).rejects.toThrow(/pending request/i);
  });

  it('assertNoPendingRow passes when no pending rows', async () => {
    const repo = { count: jest.fn().mockResolvedValue(0) };
    await expect(
      assertNoPendingRow(repo as never, { user_id: 'u1' }),
    ).resolves.toBeUndefined();
  });

  it('assertNoPendingSql throws on positive count', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ count: '2' }]),
    };
    await expect(
      assertNoPendingSql(
        dataSource as never,
        'SELECT COUNT(*)::text AS count FROM leaves WHERE user_id = $1',
        ['u1'],
      ),
    ).rejects.toThrow(/pending request/i);
  });

  it('assertNoPendingSql passes on zero count', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ count: '0' }]),
    };
    await expect(
      assertNoPendingSql(dataSource as never, 'SELECT 1', []),
    ).resolves.toBeUndefined();
  });
});
