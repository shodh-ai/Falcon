import { ConfigService } from '@nestjs/config';
import { FacultyAiService } from './faculty-ai.service';

describe('Faculty AI deployment-owned schema', () => {
  function serviceWith(query: jest.Mock) {
    return new FacultyAiService(
      {} as never,
      {} as never,
      { query } as never,
      new ConfigService({}),
    );
  }

  it('starts with SELECT-only probes using a runtime role without schema ownership', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = serviceWith(query);

    await service.onModuleInit();
    await service.onModuleInit();

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain(
      'FROM faculty_ai_conversations WHERE FALSE',
    );
    expect(query.mock.calls[1][0]).toContain(
      'FROM faculty_ai_messages WHERE FALSE',
    );
    for (const [sql] of query.mock.calls) {
      expect(String(sql).trim()).toMatch(/^SELECT\b/);
      expect(sql).not.toMatch(/\b(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\b/);
    }
  });

  it('stops startup with deployment guidance when a migration or runtime grant is missing', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(
        new Error('permission denied for table faculty_ai_messages'),
      );
    const service = serviceWith(query);

    await expect(service.onModuleInit()).rejects.toThrow(
      'Run node scripts/deploy-migrate.js',
    );
    expect(query).toHaveBeenCalledTimes(2);
  });
});
