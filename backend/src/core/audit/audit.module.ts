import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../../entities/audit-log.entity';
import { SystemAuditLog } from '../../entities/system-audit-log.entity';
import { AuditService } from './audit.service';
import { EnterpriseAuditService } from './enterprise-audit.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog, SystemAuditLog])],
  providers: [AuditService, EnterpriseAuditService],
  exports: [AuditService, EnterpriseAuditService],
})
export class AuditModule {}
