import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  REQUIRE_HR_POWER_KEY,
  type RequireHrPowerMeta,
} from '../decorators/require-hr-power.decorator';
import { HrAccessControlService } from '../../modules/hr/hr-access-control.service';

type AuthUser = {
  user_id: string;
  tenant_id?: string;
  role?: string;
  roles?: string[];
};

@Injectable()
export class HrPowerGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: HrAccessControlService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<RequireHrPowerMeta | undefined>(
      REQUIRE_HR_POWER_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!meta) return true;

    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = req.user;
    if (!user?.user_id) throw new ForbiddenException('Authentication required');

    const roles = user.roles ?? (user.role ? [user.role] : []);
    const tenantId = user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';

    await this.access.assertPower(tenantId, user.user_id, roles, meta.module, meta.action);
    return true;
  }
}
