import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_KEY } from '../decorators/requires-feature.decorator';
import { TenantContextService } from '../../tenant/tenant-context.service';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantContext: TenantContextService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const feature = this.reflector.getAllAndOverride<string>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature) return true;

    if (!this.tenantContext.hasFeature(feature)) {
      throw new ForbiddenException(
        `The "${feature}" module is not enabled for your institution. Contact your administrator.`,
      );
    }
    return true;
  }
}
