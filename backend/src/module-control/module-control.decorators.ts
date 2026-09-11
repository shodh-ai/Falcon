import { SetMetadata } from '@nestjs/common';
import type { ModuleKey } from './module-catalog';

export const MODULE_OWNER_KEY = 'falcon:module-owner';
export const MODULE_HISTORY_READ_KEY = 'falcon:module-history-read';

export const BelongsToModule = (moduleKey: ModuleKey) =>
  SetMetadata(MODULE_OWNER_KEY, moduleKey);

export const AllowModuleHistoryRead = () =>
  SetMetadata(MODULE_HISTORY_READ_KEY, true);
