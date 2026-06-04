import { SetMetadata } from '@nestjs/common';

export const ALLOW_IMPERSONATION_WRITE_KEY = 'allowImpersonationWrite';
export const AllowImpersonationWrite = () => SetMetadata(ALLOW_IMPERSONATION_WRITE_KEY, true);
