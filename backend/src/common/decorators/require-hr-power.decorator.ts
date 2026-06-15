import { SetMetadata } from '@nestjs/common';

export type HrPowerAction = 'view' | 'edit' | 'approve' | 'delete';

export type RequireHrPowerMeta = {
  module: string;
  action: HrPowerAction;
};

export const REQUIRE_HR_POWER_KEY = 'require_hr_power';

/** Granular capability check against hr_access_controls (Layer 1). */
export const RequireHrPower = (module: string, action: HrPowerAction) =>
  SetMetadata(REQUIRE_HR_POWER_KEY, { module, action } satisfies RequireHrPowerMeta);
