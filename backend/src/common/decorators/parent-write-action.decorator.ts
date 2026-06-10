import { SetMetadata } from '@nestjs/common';

export const PARENT_WRITE_ACTION_KEY = 'parentWriteAction';

/** Allows POST on read-only parent portal controllers (payments, PTM requests). */
export const ParentWriteAction = () => SetMetadata(PARENT_WRITE_ACTION_KEY, true);
