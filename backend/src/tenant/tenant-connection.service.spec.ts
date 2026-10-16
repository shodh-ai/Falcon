import { InternalServerErrorException } from '@nestjs/common';
import { TenantConnectionService } from './tenant-connection.service';

describe('TenantConnectionService.withTenantTransaction', () => {
  const tenantId = 'tenant-a';
  const manager = { query: jest.fn() };

  let queryRunner: {
    manager: typeof manager;
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    query: jest.Mock;
  };
  let dataSource: { createQueryRunner: jest.Mock };
  let tenants: { findById: jest.Mock };
  let service: TenantConnectionService;

  beforeEach(() => {
    queryRunner = {
      manager,
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue(undefined),
    };
    dataSource = { createQueryRunner: jest.fn(() => queryRunner) };
    tenants = {
      findById: jest.fn().mockResolvedValue({
        tenant_id: tenantId,
        pg_schema: 'tenant_alpha',
      }),
    };
    service = new TenantConnectionService(dataSource as never, tenants as never);
  });

  it('uses the validated stored schema and provides a transaction-bound manager', async () => {
    const callback = jest.fn().mockResolvedValue({ ok: true });

    await expect(
      service.withTenantTransaction(tenantId, callback),
    ).resolves.toEqual({ ok: true });

    expect(tenants.findById).toHaveBeenCalledWith(tenantId);
    expect(queryRunner.connect).toHaveBeenCalledTimes(1);
    expect(queryRunner.startTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.query).toHaveBeenCalledWith(
      'SET LOCAL search_path TO "tenant_alpha", public',
    );
    expect(callback).toHaveBeenCalledWith(manager);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('rejects an unknown tenant before creating a tenant query runner', async () => {
    tenants.findById.mockRejectedValue(new Error('Tenant not found'));

    await expect(
      service.withTenantTransaction('unknown-tenant', jest.fn()),
    ).rejects.toThrow('Tenant not found');

    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  it('rejects an invalid stored schema before creating a tenant query runner', async () => {
    tenants.findById.mockResolvedValue({
      tenant_id: tenantId,
      pg_schema: 'tenant_alpha; DROP SCHEMA public',
    });

    await expect(
      service.withTenantTransaction(tenantId, jest.fn()),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  it('rejects a missing stored schema before creating a tenant query runner', async () => {
    tenants.findById.mockResolvedValue({
      tenant_id: tenantId,
      pg_schema: null,
    });

    await expect(
      service.withTenantTransaction(tenantId, jest.fn()),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  it('rolls back and releases when the callback fails', async () => {
    const failure = new Error('callback failure');

    await expect(
      service.withTenantTransaction(tenantId, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('releases the runner when transaction initialization fails', async () => {
    queryRunner.startTransaction.mockRejectedValue(new Error('begin failed'));

    await expect(
      service.withTenantTransaction(tenantId, jest.fn()),
    ).rejects.toThrow('begin failed');

    expect(queryRunner.query).not.toHaveBeenCalled();
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back and releases when SET LOCAL fails', async () => {
    queryRunner.query.mockRejectedValue(new Error('schema setup failed'));

    await expect(
      service.withTenantTransaction(tenantId, jest.fn()),
    ).rejects.toThrow('schema setup failed');

    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('does not commit when the commit operation itself fails', async () => {
    queryRunner.commitTransaction.mockRejectedValue(new Error('commit failed'));

    await expect(
      service.withTenantTransaction(tenantId, jest.fn().mockResolvedValue({})),
    ).rejects.toThrow('commit failed');

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });
});
