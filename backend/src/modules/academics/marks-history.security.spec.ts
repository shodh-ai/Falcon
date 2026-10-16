import { DataSource } from 'typeorm';
import { MarksHistoryService } from './marks-history.service';

describe('published exam report query', () => {
  it('requires tenant, student, and both declaration timestamps', async () => {
    const query = jest.fn().mockResolvedValue([
      { result_id: 'result-a', grade: 'A' },
    ]);
    const service = new MarksHistoryService({ query } as unknown as DataSource);

    await expect(
      service.getPublishedExamReports('tenant-a', 'student-a'),
    ).resolves.toEqual([{ result_id: 'result-a', grade: 'A' }]);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('r.tenant_id = $1 AND r.student_user_id = $2'),
      ['tenant-a', 'student-a'],
    );
    expect(query.mock.calls[0][0]).toContain(
      'r.declared_at IS NOT NULL AND s.declared_at IS NOT NULL',
    );
    expect(query.mock.calls[0][0]).toContain(
      'c.tenant_id = r.tenant_id',
    );
    expect(query.mock.calls[0][0]).toContain(
      's.tenant_id = r.tenant_id',
    );
  });

  it('propagates database errors instead of turning them into an empty result', async () => {
    const query = jest.fn().mockRejectedValue(new Error('database unavailable'));
    const service = new MarksHistoryService({ query } as unknown as DataSource);

    await expect(
      service.getPublishedExamReports('tenant-a', 'student-a'),
    ).rejects.toThrow('database unavailable');
  });
});
