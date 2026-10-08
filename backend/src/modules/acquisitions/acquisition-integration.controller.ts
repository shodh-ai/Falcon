/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return -- Integration service query rows are untyped */
import {
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AcquisitionIntegrationService } from './acquisition-integration.service';
import type { CreateAcquisitionInput } from './acquisition.types';
import {
  IrmsServiceAuthGuard,
  type IrmsIdentity,
} from './irms-service-auth.guard';

type IntegrationRequest = Request & { integration: IrmsIdentity };

@Controller('api/integrations/v1/acquisitions')
@UseGuards(IrmsServiceAuthGuard)
export class AcquisitionIntegrationController {
  constructor(private readonly integration: AcquisitionIntegrationService) {}

  @Post()
  create(
    @Req() req: IntegrationRequest,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-request-id') requestId: string,
    @Body()
    body: {
      requester_user_id: string;
      external_reference: string;
      acquisition: Omit<
        CreateAcquisitionInput,
        'source' | 'external_reference'
      >;
    },
  ) {
    return this.integration.create(
      req.integration,
      idempotencyKey,
      requestId,
      body,
    );
  }

  @Get(':versionId')
  async status(
    @Req() req: IntegrationRequest,
    @Param('versionId') versionId: string,
  ) {
    const result = await this.integration.status(req.integration, versionId);
    if (!result) throw new NotFoundException('Acquisition not found');
    return result;
  }
}
