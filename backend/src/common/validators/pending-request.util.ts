import { ConflictException } from '@nestjs/common';
import type { DataSource, Repository, ObjectLiteral } from 'typeorm';

const DEFAULT_MESSAGE = 'You already have a pending request of this type.';

export async function assertNoPendingRow<T extends ObjectLiteral>(
  repo: Repository<T>,
  where: Record<string, unknown>,
  message = DEFAULT_MESSAGE,
): Promise<void> {
  const count = await repo.count({ where: where as never });
  if (count > 0) throw new ConflictException(message);
}

export async function assertNoPendingSql(
  dataSource: DataSource,
  sql: string,
  params: unknown[],
  message = DEFAULT_MESSAGE,
): Promise<void> {
  const rows = await dataSource.query<Array<{ count: string }>>(sql, params);
  if (Number(rows[0]?.count ?? 0) > 0) throw new ConflictException(message);
}
