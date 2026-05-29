import { SetMetadata } from '@nestjs/common';
import type { TenantFeature } from '../../entities/tenant-subscription.entity';

export const FEATURE_KEY = 'requiredFeature';

export const RequiresFeature = (feature: TenantFeature) =>
  SetMetadata(FEATURE_KEY, feature);
