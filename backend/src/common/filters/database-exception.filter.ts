import { ArgumentsHost, Catch } from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { QueryFailedError } from 'typeorm';

type PostgresDriverError = Error & {
  code?: string;
  detail?: string;
};

const RETIREMENT_HOLD_PREFIX = 'ASSET_RETIREMENT_HOLD_ACTIVE:';

@Catch(QueryFailedError)
export class DatabaseExceptionFilter extends BaseExceptionFilter {
  constructor(adapterHost: HttpAdapterHost) {
    super(adapterHost.httpAdapter);
  }

  override catch(exception: QueryFailedError, host: ArgumentsHost) {
    const driverError = exception.driverError as PostgresDriverError;
    const message = driverError.message ?? exception.message;

    if (
      driverError.code === '55000' &&
      message.includes(RETIREMENT_HOLD_PREFIX)
    ) {
      const retirementCaseId = message
        .slice(
          message.indexOf(RETIREMENT_HOLD_PREFIX) +
            RETIREMENT_HOLD_PREFIX.length,
        )
        .split(/\s|\n/)[0]
        .replace(/[^0-9a-f-]/gi, '');
      const response = host.switchToHttp().getResponse();
      this.applicationRef!.reply(
        response,
        {
          statusCode: 409,
          code: 'ASSET_RETIREMENT_HOLD_ACTIVE',
          message:
            'Inventory operation is blocked by an active Module 9 retirement hold',
          retirement_case_id: retirementCaseId || undefined,
        },
        409,
      );
      return;
    }

    super.catch(exception, host);
  }
}
