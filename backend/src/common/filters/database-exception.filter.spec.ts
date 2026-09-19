import type { ArgumentsHost } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { QueryFailedError } from 'typeorm';
import { DatabaseExceptionFilter } from './database-exception.filter';

describe('DatabaseExceptionFilter', () => {
  it('maps the Module 9 database hold guard to a structured 409', () => {
    const reply = jest.fn();
    const filter = new DatabaseExceptionFilter({
      httpAdapter: { reply },
    } as unknown as HttpAdapterHost);
    const response = {};
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as ArgumentsHost;
    const driverError = Object.assign(
      new Error(
        'ASSET_RETIREMENT_HOLD_ACTIVE:19d4525e-3cb1-491b-a25c-a6805e177264',
      ),
      { code: '55000' },
    );
    const error = new QueryFailedError('UPDATE inv_records', [], driverError);

    filter.catch(error, host);

    expect(reply).toHaveBeenCalledWith(
      response,
      {
        statusCode: 409,
        code: 'ASSET_RETIREMENT_HOLD_ACTIVE',
        message:
          'Inventory operation is blocked by an active Module 9 retirement hold',
        retirement_case_id: '19d4525e-3cb1-491b-a25c-a6805e177264',
      },
      409,
    );
  });
});
