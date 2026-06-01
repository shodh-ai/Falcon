import { SetMetadata } from '@nestjs/common';

export const READ_ONLY_PORTAL_KEY = 'readOnlyPortal';
export const ReadOnlyPortal = () => SetMetadata(READ_ONLY_PORTAL_KEY, true);
