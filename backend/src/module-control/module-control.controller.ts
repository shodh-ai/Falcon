import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { BelongsToModule } from './module-control.decorators';
import { MODULE_STATES, type ModuleState } from './module-catalog';
import { ModuleControlService } from './module-control.service';

type AuthRequest = {
  user: {
    user_id: string;
    tenant_id?: string;
    role?: string;
    roles?: string[];
    campus_ids?: Array<string | number>;
    dept_id?: string | number;
  };
};

@Controller('api/platform/modules')
@UseGuards(JwtAuthGuard, RolesGuard)
@BelongsToModule('CORE')
export class ModuleRuntimeController {
  constructor(private readonly modules: ModuleControlService) {}

  @Get()
  catalogue() {
    return this.modules.catalogue();
  }

  @Get('runtime')
  async runtime(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const manifest = await this.modules.runtimeManifest({
      tenantId: this.tenant(req),
      userId: req.user.user_id,
      campusIds: req.user.campus_ids,
      departmentId: req.user.dept_id,
    });
    res.setHeader('ETag', `"${manifest.revision}"`);
    res.setHeader('Cache-Control', 'private, max-age=30');
    return manifest;
  }

  @Get(':key/readiness')
  @Roles('SuperAdmin', 'CampusAdmin', 'TenantAdmin')
  readiness(
    @Param('key') key: string,
    @Req() req: AuthRequest,
    @Query('scope_type') scopeType?: string,
    @Query('scope_id') scopeId?: string,
  ) {
    return this.modules.readiness(key, {
      tenantId: this.tenant(req),
      userId: req.user.user_id,
      campusIds: req.user.campus_ids,
      departmentId: scopeType === 'DEPARTMENT' ? scopeId : req.user.dept_id,
    });
  }

  private tenant(req: AuthRequest) {
    if (!req.user.tenant_id)
      throw new Error('Authenticated tenant context is required');
    return req.user.tenant_id;
  }
}

@Controller('api/platform')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SuperAdmin', 'CampusAdmin', 'TenantAdmin')
@BelongsToModule('CORE')
export class ModuleControlController {
  constructor(private readonly modules: ModuleControlService) {}

  @Post('module-readiness/:key/evidence')
  recordReadinessEvidence(
    @Param('key') key: string,
    @Req() req: AuthRequest,
    @Body() body: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    this.requireIdempotency(idempotencyKey);
    if (!['TENANT', 'CAMPUS', 'DEPARTMENT'].includes(body.scope_type))
      throw new BadRequestException('Invalid readiness evidence scope');
    if (body.scope_type !== 'TENANT' && !String(body.scope_id ?? '').trim())
      throw new BadRequestException('scope_id is required for scoped evidence');
    if (!['PASS', 'FAIL'].includes(body.status))
      throw new BadRequestException('Invalid readiness evidence status');
    return this.modules.recordReadinessEvidence({
      tenantId: this.tenant(req),
      moduleKey: key,
      scopeType: body.scope_type,
      scopeId: body.scope_id,
      checkKey: body.check_key,
      status: body.status,
      evidenceHash: body.evidence_hash,
      details: body.details,
      validUntil: body.valid_until,
      actorId: req.user.user_id,
      idempotencyKey,
    });
  }

  @Post('module-rollouts')
  createRollout(
    @Req() req: AuthRequest,
    @Body() body: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    this.requireIdempotency(idempotencyKey);
    if (!(MODULE_STATES as readonly string[]).includes(body.desired_state))
      throw new BadRequestException('Invalid desired_state');
    return this.modules.createRollout({
      moduleKey: body.module_key,
      tenantId: this.tenant(req),
      scopeType: body.scope_type ?? 'TENANT',
      scopeId: body.scope_id,
      desiredState: body.desired_state as ModuleState,
      proposerId: req.user.user_id,
      reason: body.reason,
      scheduledAt: body.scheduled_at,
      idempotencyKey,
    });
  }

  @Post('module-rollouts/:id/submit')
  submit(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Headers('if-match') ifMatch?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    this.requireIdempotency(idempotencyKey);
    return this.modules.submitRollout(
      id,
      this.tenant(req),
      req.user.user_id,
      this.revision(ifMatch),
      idempotencyKey,
    );
  }

  @Post('module-rollouts/:id/approve')
  approve(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Headers('if-match') ifMatch?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    this.requireIdempotency(idempotencyKey);
    return this.modules.approveRollout(
      id,
      this.tenant(req),
      req.user.user_id,
      this.revision(ifMatch),
      [...(req.user.roles ?? []), ...(req.user.role ? [req.user.role] : [])],
      idempotencyKey,
    );
  }

  @Post('modules/:key/:action')
  proposeAction(
    @Param('key') key: string,
    @Param('action') action: string,
    @Req() req: AuthRequest,
    @Body() body: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    this.requireIdempotency(idempotencyKey);
    const desired: Record<string, ModuleState> = {
      activate: 'ACTIVE',
      drain: 'DRAINING',
      pause: 'PAUSED',
      resume: 'ACTIVE',
    };
    if (!desired[action])
      throw new BadRequestException('Unsupported module action');
    if (action === 'pause' && body.emergency === true) {
      const roles = [
        ...(req.user.roles ?? []),
        ...(req.user.role ? [req.user.role] : []),
      ];
      if (body.scope_type === 'GLOBAL' && !roles.includes('SuperAdmin'))
        throw new BadRequestException(
          'Only SuperAdmin may issue a global emergency pause',
        );
      return this.modules.emergencyPause({
        moduleKey: key,
        tenantId: this.tenant(req),
        actorId: req.user.user_id,
        reason: body.reason,
        incidentReference: body.incident_reference,
        global: body.scope_type === 'GLOBAL',
      });
    }
    return this.modules.createRollout({
      moduleKey: key,
      tenantId: this.tenant(req),
      scopeType: body.scope_type ?? 'TENANT',
      scopeId: body.scope_id,
      desiredState: desired[action],
      proposerId: req.user.user_id,
      reason: body.reason ?? `${action} requested`,
      scheduledAt: body.scheduled_at,
      idempotencyKey,
    });
  }

  @Get('module-rollouts')
  rollouts(@Req() req: AuthRequest) {
    return this.modules.listRollouts(this.tenant(req));
  }

  @Get('module-handoffs')
  handoffs(@Req() req: AuthRequest, @Query('status') status?: string) {
    return this.modules.listHandoffs(this.tenant(req), status);
  }

  @Post('module-handoffs/:id/retry')
  retry(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    this.requireIdempotency(idempotencyKey);
    return this.modules.retryHandoff(id, this.tenant(req));
  }

  private tenant(req: AuthRequest) {
    if (!req.user.tenant_id)
      throw new Error('Authenticated tenant context is required');
    return req.user.tenant_id;
  }

  private revision(value?: string): number {
    const parsed = Number(String(value ?? '').replace(/\"/g, ''));
    if (!Number.isInteger(parsed) || parsed < 0)
      throw new BadRequestException('If-Match revision is required');
    return parsed;
  }

  private requireIdempotency(value?: string): asserts value is string {
    if (!value?.trim())
      throw new BadRequestException('Idempotency-Key is required');
  }
}
