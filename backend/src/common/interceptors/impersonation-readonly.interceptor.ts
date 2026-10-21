import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ImpersonationReadOnlyGuard } from '../guards/impersonation-readonly.guard';

/** Global guards run before controller authentication guards. Enforce the same
 * policy again after authentication, before any business handler can mutate. */
@Injectable()
export class ImpersonationReadOnlyInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    new ImpersonationReadOnlyGuard(this.reflector).canActivate(context);
    return next.handle();
  }
}
