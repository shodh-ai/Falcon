import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import type { Tenant } from '../entities/tenant.entity';

export interface TenantContextStore {
  tenant: Tenant;
  pgSchema: string;
  features: Set<string>;
}

@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantContextStore>();

  run<T>(store: TenantContextStore, fn: () => T): T {
    return this.storage.run(store, fn);
  }

  get(): TenantContextStore | undefined {
    return this.storage.getStore();
  }

  getTenantId(): string | undefined {
    return this.storage.getStore()?.tenant.tenant_id;
  }

  getPgSchema(): string {
    return this.storage.getStore()?.pgSchema ?? 'public';
  }

  hasFeature(featureKey: string): boolean {
    const store = this.storage.getStore();
    if (!store) return false;
    return store.features.has(featureKey);
  }

  getSettings(): Record<string, unknown> {
    return (this.storage.getStore()?.tenant.settings ?? {}) as Record<string, unknown>;
  }
}
