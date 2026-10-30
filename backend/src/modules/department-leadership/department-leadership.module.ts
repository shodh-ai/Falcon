import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DepartmentLeadershipService } from './department-leadership.service';
import {
  DepartmentLeadershipController,
  PrincipalWorkspaceController,
  DeanLeadershipWorkspaceController,
} from './department-leadership.controller';
import { OfficeAuditInterceptor } from './office-audit.interceptor';
@Module({
  providers: [
    DepartmentLeadershipService,
    { provide: APP_INTERCEPTOR, useClass: OfficeAuditInterceptor },
  ],
  controllers: [DepartmentLeadershipController, PrincipalWorkspaceController, DeanLeadershipWorkspaceController],
  exports: [DepartmentLeadershipService],
})
export class DepartmentLeadershipModule {}
