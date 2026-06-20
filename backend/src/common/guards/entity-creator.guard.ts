import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ENTITY_CREATOR_KEY } from '../decorators/entity-creator.decorator';

const ENTITY_CREATOR_EMAIL = 'superadmin@mygyanvihar.com';

@Injectable()
export class EntityCreatorGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(
      ENTITY_CREATOR_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const req = context
      .switchToHttp()
      .getRequest<{ user?: { email?: string } }>();
    const email = (req.user?.email ?? '').trim().toLowerCase();
    if (email !== ENTITY_CREATOR_EMAIL) {
      throw new ForbiddenException(
        'Entity management is restricted to the master Super Admin account',
      );
    }
    return true;
  }
}
