import { HrPermission } from './hr-permission.decorator';
import type { HrModuleKey } from '../../modules/hr/hr-entity-context.service';

/** Alias for @HrPermission — checks hr_permissions table at runtime. */
export const RequirePermission = (module: HrModuleKey, level: 'read' | 'write') =>
  HrPermission(module, level);
