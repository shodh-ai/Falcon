import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { READ_ONLY_PORTAL_KEY } from '../decorators/read-only-portal.decorator';
import { PARENT_WRITE_ACTION_KEY } from '../decorators/parent-write-action.decorator';
import { IS_PUBLIC_KEY } from '../decorators/roles.decorator';
import { isReadOnlyRole } from '../config/role-permissions.matrix';

/** Blocks POST/PATCH/PUT/DELETE for read-only roles (e.g. Parent) on marked controllers. */
@Injectable()
export class ReadOnlyPortalGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const readOnly = this.reflector.getAllAndOverride<boolean>(
      READ_ONLY_PORTAL_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!readOnly) return true;

    const req = context.switchToHttp().getRequest();
    const method = String(req.method ?? 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS')
      return true;

    const parentWrite = this.reflector.getAllAndOverride<boolean>(
      PARENT_WRITE_ACTION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (parentWrite && req.user?.auth_type === 'parent') return true;

    const role = req.user?.role ?? req.user?.primaryRole;
    if (req.user?.auth_type === 'parent' || isReadOnlyRole(role)) {
      throw new ForbiddenException('Parent portal is read-only');
    }
    return true;
  }
}
