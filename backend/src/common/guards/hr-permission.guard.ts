import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  HR_PERMISSION_KEY,
  type HrPermissionMeta,
} from '../decorators/hr-permission.decorator';
import { HrEntityContextService } from '../../modules/hr/hr-entity-context.service';

type AuthUser = {
  user_id: string;
  tenant_id?: string;
  role?: string;
  roles?: string[];
};

@Injectable()
export class HrPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entityCtx: HrEntityContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<HrPermissionMeta | undefined>(
      HR_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!meta) return true;

    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = req.user;
    if (!user?.user_id) throw new ForbiddenException('Authentication required');

    const roles = user.roles ?? (user.role ? [user.role] : []);
    const tenantId = user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';

    await this.entityCtx.assertModuleAccess(
      tenantId,
      user.user_id,
      roles,
      meta.module,
      meta.level,
    );
    return true;
  }
}
