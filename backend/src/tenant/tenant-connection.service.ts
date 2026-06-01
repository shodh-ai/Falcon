import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Sets PostgreSQL search_path per request for schema-per-tenant isolation.
 * Always resets search_path when the request completes (connection pool safety).
 */
@Injectable()
export class TenantConnectionService {
  private readonly logger = new Logger(TenantConnectionService.name);

  constructor(private readonly dataSource: DataSource) {}

  async withSchema<T>(pgSchema: string, fn: () => Promise<T>): Promise<T> {
    const safeSchema = pgSchema.replace(/[^a-zA-Z0-9_]/g, '');
    if (safeSchema !== pgSchema) {
      throw new Error('Invalid PostgreSQL schema name');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      await queryRunner.query(`SET search_path TO "${safeSchema}", public`);
      return await fn();
    } finally {
      try {
        await queryRunner.query('SET search_path TO public');
      } catch (err) {
        this.logger.warn(`Failed to reset search_path: ${err}`);
      }
      await queryRunner.release();
    }
  }
}
