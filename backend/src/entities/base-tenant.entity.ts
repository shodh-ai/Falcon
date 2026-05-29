import { Column, Index } from 'typeorm';

/**
 * Mixin columns for row-level tenant isolation (defense-in-depth alongside schema-per-tenant).
 * Extend this class on every tenant-scoped entity.
 */
export abstract class BaseTenantEntity {
  @Column({ type: 'uuid', name: 'tenant_id' })
  @Index()
  tenant_id: string;
}
