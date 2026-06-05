import { AsyncLocalStorage } from 'node:async_hooks';

export type EntityScopeStore = {
  entityId: number;
  tenantId: string;
  userId: string;
};

const storage = new AsyncLocalStorage<EntityScopeStore>();

export const EntityScopeContext = {
  run<T>(store: EntityScopeStore, fn: () => T): T {
    return storage.run(store, fn);
  },

  get(): EntityScopeStore | undefined {
    return storage.getStore();
  },

  getEntityId(): number | undefined {
    return storage.getStore()?.entityId;
  },

  requireEntityId(): number {
    const id = storage.getStore()?.entityId;
    if (!id) {
      throw new Error('Entity scope not set on this request');
    }
    return id;
  },
};
