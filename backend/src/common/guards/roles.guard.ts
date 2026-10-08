import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { rolesIntersect } from '../config/campus-admin.roles';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user || (!user.role && !Array.isArray(user.roles))) {
      return false;
    }

    const userRoles = Array.from(
      new Set([
        ...(Array.isArray(user.roles) ? user.roles : []),
        ...(user.role ? [user.role] : []),
      ]),
    ).filter(Boolean);

    return rolesIntersect(userRoles, requiredRoles);
  }
}
