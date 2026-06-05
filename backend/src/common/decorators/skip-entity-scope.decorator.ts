import { SetMetadata } from '@nestjs/common';

export const SKIP_ENTITY_SCOPE_KEY = 'skipEntityScope';
export const SkipEntityScope = () => SetMetadata(SKIP_ENTITY_SCOPE_KEY, true);
