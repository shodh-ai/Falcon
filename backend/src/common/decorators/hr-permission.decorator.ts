import { SetMetadata } from '@nestjs/common';
import type { HrModuleKey } from '../../modules/hr/hr-entity-context.service';

export const HR_PERMISSION_KEY = 'hr_permission';

export type HrPermissionMeta = {
  module: HrModuleKey;
  level: 'read' | 'write';
};

export const HrPermission = (module: HrModuleKey, level: 'read' | 'write') =>
  SetMetadata(HR_PERMISSION_KEY, { module, level } satisfies HrPermissionMeta);
