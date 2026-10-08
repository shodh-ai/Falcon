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
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PhysicalIdentityService } from './physical-identity.service';
import type {
  AttachmentResultInput,
  EncodingResultInput,
  GateObservationInput,
  PhysicalIdentityActor,
  PrintResultInput,
  RegisterDeviceInput,
  VerifyAttachmentInput,
} from './physical-identity.types';

@Controller('api/physical-identity/v1')
@UseGuards(JwtAuthGuard)
export class PhysicalIdentityController {
  constructor(private readonly service: PhysicalIdentityService) {}
  private revision(value?: string) {
    const parsed = Number(value?.replace(/^W\//, '').replace(/"/g, ''));
    if (!Number.isInteger(parsed) || parsed < 1)
      throw new BadRequestException('If-Match revision required');
    return parsed;
  }
  @Get('dashboard') dashboard(@Req() req: { user: PhysicalIdentityActor }) {
    return this.service.dashboard(req.user);
  }
  @Get('jobs') jobs(@Req() req: { user: PhysicalIdentityActor }) {
    return this.service.jobs(req.user);
  }
  @Get('eligible-assets') eligibleAssets(
    @Req() req: { user: PhysicalIdentityActor },
  ) {
    return this.service.eligibleAssets(req.user);
  }
  @Get('jobs/:id') job(
    @Req() req: { user: PhysicalIdentityActor },
    @Param('id') id: string,
  ) {
    return this.service.job(req.user, id);
  }
  @Post('inventory/:inventoryId/jobs') requestJob(
    @Req() req: { user: PhysicalIdentityActor },
    @Param('inventoryId') inventoryId: string,
    @Headers('idempotency-key') key: string,
    @Body()
    body: {
      job_type?: 'NEW' | 'RETROFIT' | 'REPLACEMENT';
      hardware_profile_id?: string;
    },
  ) {
    return this.service.requestJob(req.user, inventoryId, key, body);
  }
  @Post('jobs/:id/verify-attachment') verifyAttachment(
    @Req() req: { user: PhysicalIdentityActor },
    @Param('id') id: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body() body: VerifyAttachmentInput,
  ) {
    return this.service.verifyAttachment(
      req.user,
      id,
      this.revision(revision),
      key,
      body,
    );
  }
  @Post('jobs/:id/void') voidJob(
    @Req() req: { user: PhysicalIdentityActor },
    @Param('id') id: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body() body: { reason: string },
  ) {
    return this.service.voidJob(
      req.user,
      id,
      this.revision(revision),
      key,
      body,
    );
  }
  @Get('devices') devices(@Req() req: { user: PhysicalIdentityActor }) {
    return this.service.devices(req.user);
  }
  @Get('hardware-profiles') profiles(
    @Req() req: { user: PhysicalIdentityActor },
  ) {
    return this.service.hardwareProfiles(req.user);
  }
  @Post('devices/admin-register') register(
    @Req() req: { user: PhysicalIdentityActor },
    @Headers('idempotency-key') key: string,
    @Body() body: RegisterDeviceInput,
  ) {
    return this.service.registerDevice(req.user, key, body);
  }
  @Get('policies') policies(@Req() req: { user: PhysicalIdentityActor }) {
    return this.service.policies(req.user);
  }
  @Post('policies') policy(
    @Req() req: { user: PhysicalIdentityActor },
    @Headers('idempotency-key') key: string,
    @Body() body: Parameters<PhysicalIdentityService['publishPolicy']>[2],
  ) {
    return this.service.publishPolicy(req.user, key, body);
  }
  @Get('gate/observations') observations(
    @Req() req: { user: PhysicalIdentityActor },
  ) {
    return this.service.gateObservations(req.user);
  }
  @Get('gate/alerts') alerts(@Req() req: { user: PhysicalIdentityActor }) {
    return this.service.gateAlerts(req.user);
  }
  @Post('gate/alerts/:id/action') alertAction(
    @Req() req: { user: PhysicalIdentityActor },
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Body()
    body: {
      action: 'ACKNOWLEDGE' | 'ESCALATE' | 'RESOLVE';
      resolution?: string;
    },
  ) {
    return this.service.resolveGateAlert(req.user, id, key, body);
  }
}

@Public()
@Controller('api/physical-identity/v1')
export class PhysicalIdentityMachineController {
  constructor(private readonly service: PhysicalIdentityService) {}
  private machineHeaders(
    headers: Record<string, string | string[] | undefined>,
  ) {
    const one = (value: string | string[] | undefined) =>
      Array.isArray(value) ? value[0] : value;
    return {
      'x-device-id': one(headers['x-device-id']),
      'x-client-cert-fingerprint': one(headers['x-client-cert-fingerprint']),
      'x-device-signature': one(headers['x-device-signature']),
      'x-device-sequence': one(headers['x-device-sequence']),
    };
  }
  @Post('devices/register')
  registerMachine(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Headers('idempotency-key') key: string,
    @Body() body: RegisterDeviceInput & { tenant_id: string },
  ) {
    const one = (value: string | string[] | undefined) =>
      Array.isArray(value) ? value[0] : value;
    return this.service.registerMachine(
      {
        'x-client-cert-fingerprint': one(headers['x-client-cert-fingerprint']),
        'x-device-bootstrap-token': one(headers['x-device-bootstrap-token']),
        'x-device-signature': one(headers['x-device-signature']),
      },
      key,
      body,
    );
  }
  @Get('public/scan/:code')
  publicScan(@Param('code') code: string, @Query('token') token: string) {
    return this.service.publicLabelScan(code, token);
  }
  @Post('devices/:id/attest') attest(
    @Param('id') id: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body()
    body: { firmware_version: string; attestation: Record<string, unknown> },
  ) {
    return this.service.attestDevice(id, this.machineHeaders(headers), body);
  }
  @Post('jobs/:id/claim') claim(
    @Param('id') id: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Headers('idempotency-key') key: string,
  ) {
    return this.service.claimJob(id, this.machineHeaders(headers), key);
  }
  @Post('jobs/:id/encode-result') encoding(
    @Param('id') id: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Headers('idempotency-key') key: string,
    @Body() body: EncodingResultInput,
  ) {
    return this.service.recordEncoding(
      id,
      this.machineHeaders(headers),
      key,
      body,
    );
  }
  @Post('jobs/:id/print-result') print(
    @Param('id') id: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Headers('idempotency-key') key: string,
    @Body() body: PrintResultInput,
  ) {
    return this.service.recordPrint(
      id,
      this.machineHeaders(headers),
      key,
      body,
    );
  }
  @Post('jobs/:id/attachment-result') attachment(
    @Param('id') id: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Headers('idempotency-key') key: string,
    @Body() body: AttachmentResultInput,
  ) {
    return this.service.recordAttachment(
      id,
      this.machineHeaders(headers),
      key,
      body,
    );
  }
  @Post('gate-observations/batch') observations(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Headers('idempotency-key') key: string,
    @Body() body: { observations: GateObservationInput[] },
  ) {
    return this.service.recordGateObservations(
      this.machineHeaders(headers),
      key,
      body.observations,
    );
  }
  @Get('gate-cache/snapshot') cache(
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.service.gateCache(this.machineHeaders(headers));
  }
}
