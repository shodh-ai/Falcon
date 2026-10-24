import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { HrPermissionGuard } from '../../common/guards/hr-permission.guard';
import { EntityScopeGuard } from '../../common/guards/entity-scope.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { HrPermission } from '../../common/decorators/hr-permission.decorator';
import { HrEntityContextService } from './hr-entity-context.service';
import { HrApiPolicyService, apiRevision } from './hr-api-policy.service';

type User = {
  user_id: string;
  tenant_id?: string;
  role?: string;
  roles?: string[];
};
@Controller(['hr/appraisal-policies', 'api/hr/appraisal-policies'])
@UseGuards(JwtAuthGuard, RolesGuard, HrPermissionGuard, EntityScopeGuard)
@Roles('HR', 'HRAdmin', 'SuperAdmin')
export class HrApiPolicyController {
  constructor(
    private readonly policies: HrApiPolicyService,
    private readonly entities: HrEntityContextService,
  ) {}
  private async scope(user: User, entity?: string) {
    if (!user.tenant_id)
      throw new BadRequestException('Authenticated tenant context is required');
    const entityId = await this.entities.resolveRequestEntityId(
      user.tenant_id,
      user.user_id,
      user.roles ?? (user.role ? [user.role] : []),
      entity,
    );
    return { tenantId: user.tenant_id, entityId, actorId: user.user_id };
  }
  @Get()
  @HrPermission('policies', 'read')
  async list(@Req() r: { user: User }, @Query('entity_id') entity?: string) {
    return this.policies.list(await this.scope(r.user, entity));
  }

  @Post()
  @Roles('HRAdmin', 'SuperAdmin')
  @HrPermission('policies', 'write')
  async create(
    @Req() r: { user: User },
    @Body() body: Record<string, unknown>,
    @Headers('idempotency-key') key: string,
    @Query('entity_id') entity?: string,
  ) {
    return this.policies.create(
      await this.scope(r.user, entity),
      body ?? {},
      key,
    );
  }
  @Patch(':id')
  @Roles('HRAdmin', 'SuperAdmin')
  @HrPermission('policies', 'write')
  async update(
    @Req() r: { user: User },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Headers('if-match') revision: string,
    @Query('entity_id') entity?: string,
  ) {
    return this.policies.update(
      await this.scope(r.user, entity),
      id,
      apiRevision(revision),
      body ?? {},
    );
  }
  @Post(':id/publish')
  @Roles('HRAdmin', 'SuperAdmin')
  @HrPermission('policies', 'write')
  async publish(
    @Req() r: { user: User },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Headers('if-match') revision: string,
    @Query('entity_id') entity?: string,
  ) {
    return this.policies.publish(
      await this.scope(r.user, entity),
      id,
      apiRevision(revision),
      body ?? {},
    );
  }
  @Post('preview')
  @HrPermission('policies', 'read')
  async preview(
    @Req() r: { user: User },
    @Body() body: Record<string, unknown>,
    @Query('entity_id') entity?: string,
  ) {
    return this.policies.preview(await this.scope(r.user, entity), body ?? {});
  }
  @Get(':id/history')
  @HrPermission('policies', 'read')
  async history(
    @Req() r: { user: User },
    @Param('id') id: string,
    @Query('entity_id') entity?: string,
  ) {
    return this.policies.history(await this.scope(r.user, entity), id);
  }
  @Post(':id/calculations')
  @Roles('HRAdmin', 'SuperAdmin')
  @HrPermission('policies', 'write')
  async snapshot(
    @Req() r: { user: User },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Query('entity_id') entity?: string,
  ) {
    return this.policies.saveCalculation(
      await this.scope(r.user, entity),
      id,
      apiRevision(revision),
      body ?? {},
      key,
    );
  }
  @Get(':id/calculations')
  @HrPermission('policies', 'read')
  async calculations(
    @Req() r: { user: User },
    @Param('id') id: string,
    @Query('entity_id') entity?: string,
  ) {
    return this.policies.calculations(await this.scope(r.user, entity), id);
  }
}
