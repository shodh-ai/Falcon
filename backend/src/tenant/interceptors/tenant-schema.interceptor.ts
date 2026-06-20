import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, defer, finalize, mergeMap } from 'rxjs';
import { DataSource } from 'typeorm';
import { TenantContextService } from '../tenant-context.service';

/**
 * Sets PostgreSQL search_path for schema-per-tenant isolation.
 * Note: with connection pooling, prefer dedicated schemas + row-level tenant_id
 * until per-request connection pinning is enabled in production.
 */
@Injectable()
export class TenantSchemaInterceptor implements NestInterceptor {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
  ) {}

  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const schema = this.tenantContext.getPgSchema();
    if (!schema || schema === 'public') {
      return next.handle();
    }

    const safeSchema = schema.replace(/[^a-zA-Z0-9_]/g, '');

    return defer(() =>
      this.dataSource.query(`SET search_path TO "${safeSchema}", public`),
    ).pipe(
      mergeMap(() => next.handle()),
      finalize(() => {
        void this.dataSource.query('SET search_path TO public');
      }),
    );
  }
}
