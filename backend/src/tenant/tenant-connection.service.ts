import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { TenantService } from './tenant.service';

/** Provides transaction-pinned schema access for tenant-sensitive operations. */
@Injectable()
export class TenantConnectionService {
  private readonly logger = new Logger(TenantConnectionService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly tenants: TenantService,
  ) {}

  /**
   * Runs tenant-sensitive database work on one pinned connection.
   *
   * The callback must use only the supplied EntityManager (or its
   * queryRunner). Injected repositories and the global DataSource are not
   * transaction-bound and must not be used for tenant-sensitive work here.
   */
  async withTenantTransaction<T>(
    tenantId: string,
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    // The schema is resolved from the authenticated tenant record, never from
    // a controller, header, or callback argument.
    const tenant = await this.tenants.findById(tenantId);
    const schema = this.validateSchema(tenant.pg_schema);
    const queryRunner = this.dataSource.createQueryRunner();
    let transactionStarted = false;

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();
      transactionStarted = true;
      await queryRunner.query(`SET LOCAL search_path TO "${schema}", public`);

      const result = await callback(queryRunner.manager);
      await queryRunner.commitTransaction();
      return result;
    } catch (err) {
      if (transactionStarted) {
        try {
          await queryRunner.rollbackTransaction();
        } catch (rollbackErr) {
          this.logger.error(`Tenant transaction rollback failed: ${rollbackErr}`);
        }
      }
      throw err;
    } finally {
      try {
        await queryRunner.release();
      } catch (releaseErr) {
        this.logger.warn(`Tenant transaction release failed: ${releaseErr}`);
      }
    }
  }

  private validateSchema(pgSchema: unknown): string {
    if (typeof pgSchema !== 'string') {
      throw new InternalServerErrorException('Tenant schema is invalid');
    }

    const safeSchema = pgSchema.replace(/[^a-zA-Z0-9_]/g, '');
    if (!pgSchema || safeSchema !== pgSchema) {
      throw new InternalServerErrorException('Tenant schema is invalid');
    }
    return safeSchema;
  }
}
