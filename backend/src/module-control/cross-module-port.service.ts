import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { BusinessModuleKey } from './module-catalog';
import { ModuleControlService } from './module-control.service';

export type ModulePortResult =
  | { status: 'COMPLETED'; result?: unknown }
  | { status: 'ACCEPTED_PENDING'; handoffId: string }
  | { status: 'MODULE_UNAVAILABLE'; moduleKey: BusinessModuleKey }
  | { status: 'REJECTED'; reason: string };

type Handler = (command: {
  tenantId: string;
  sourceAggregateId: string;
  sourceRevision: number;
  payload: unknown;
  idempotencyKey: string;
}) => Promise<unknown>;

@Injectable()
export class CrossModulePortService {
  private readonly logger = new Logger(CrossModulePortService.name);
  private readonly handlers = new Map<string, Handler>();
  constructor(private readonly modules: ModuleControlService) {}

  register(target: BusinessModuleKey, operationType: string, handler: Handler) {
    const key = `${target}:${operationType}`;
    if (this.handlers.has(key))
      throw new Error(`Cross-module handler already registered: ${key}`);
    this.handlers.set(key, handler);
  }

  async dispatch(command: {
    tenantId: string;
    sourceModule: BusinessModuleKey;
    targetModule: BusinessModuleKey;
    operationType: string;
    sourceAggregateId: string;
    sourceRevision: number;
    idempotencyKey: string;
    payload: unknown;
  }): Promise<ModulePortResult> {
    const handler = this.handlers.get(
      `${command.targetModule}:${command.operationType}`,
    );
    if (
      await this.modules.isAvailable(command.targetModule, command.tenantId)
    ) {
      if (!handler)
        return {
          status: 'REJECTED',
          reason: 'TARGET_OPERATION_NOT_REGISTERED',
        };
      return { status: 'COMPLETED', result: await handler(command) };
    }
    const handoff = await this.modules.enqueueHandoff(command);
    return { status: 'ACCEPTED_PENDING', handoffId: handoff.handoff_id };
  }

  @Interval(15_000)
  async replayPending() {
    for (const item of await this.modules.pendingHandoffs()) {
      if (!(await this.modules.isAvailable(item.target_module, item.tenant_id)))
        continue;
      const handler = this.handlers.get(
        `${item.target_module}:${item.operation_type}`,
      );
      if (!handler) continue;
      const claimed = await this.modules.claimHandoff(item.handoff_id);
      if (!claimed) continue;
      try {
        await handler({
          tenantId: item.tenant_id,
          sourceAggregateId: item.source_aggregate_id,
          sourceRevision: item.source_revision,
          payload: item.payload,
          idempotencyKey: item.idempotency_key,
        });
        await this.modules.completeHandoff(item.handoff_id);
      } catch (error) {
        this.logger.warn(
          `Deferred handoff ${item.handoff_id} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        await this.modules.failHandoff(item.handoff_id, error);
      }
    }
  }
}

export abstract class FinancePort extends CrossModulePortService {}
export abstract class HrmsPort extends CrossModulePortService {}
export abstract class AdmissionsPort extends CrossModulePortService {}
export abstract class InventoryPort extends CrossModulePortService {}
export abstract class ExaminationsPort extends CrossModulePortService {}
