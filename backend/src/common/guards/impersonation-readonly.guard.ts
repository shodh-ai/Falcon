import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_IMPERSONATION_WRITE_KEY } from '../decorators/allow-impersonation-write.decorator';

@Injectable()
export class ImpersonationReadOnlyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user as { read_only_impersonation?: boolean } | undefined;
    if (!user?.read_only_impersonation) return true;

    const allowed = this.reflector.getAllAndOverride<boolean>(
      ALLOW_IMPERSONATION_WRITE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowed) return true;

    const method = req.method?.toUpperCase();
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;

    throw new ForbiddenException(
      'Write actions are disabled while impersonating. Exit impersonation to make changes.',
    );
  }
}
