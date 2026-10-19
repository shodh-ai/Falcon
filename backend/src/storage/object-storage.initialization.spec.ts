import { ConfigService } from '@nestjs/config';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { ObjectStorageService } from './object-storage.service';

describe('Object storage bucket provisioning boundary', () => {
  afterEach(() => jest.restoreAllMocks());

  function configuredStorage() {
    return new ObjectStorageService(
      new ConfigService({
        S3_ENDPOINT: 'https://storage.invalid',
        S3_BUCKET: 'preprovisioned-test-bucket',
        S3_ACCESS_KEY: 'test-access-key',
        S3_SECRET_KEY: 'test-secret-key',
      }),
    );
  }

  it('only checks an existing configured bucket at startup', async () => {
    const send = jest
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValue({} as never);
    const service = configuredStorage();

    await expect(service.onModuleInit()).resolves.toBeUndefined();

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(HeadBucketCommand);
    expect((command as HeadBucketCommand).input.Bucket).toBe(
      'preprovisioned-test-bucket',
    );
    expect(service.isEnabled()).toBe(true);
  });

  it('fails clearly without creating a bucket or silently switching to disk', async () => {
    const send = jest
      .spyOn(S3Client.prototype, 'send')
      .mockRejectedValue(new Error('access denied') as never);
    const service = configuredStorage();

    await expect(service.onModuleInit()).rejects.toThrow(
      'runtime bucket creation is disabled',
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBeInstanceOf(HeadBucketCommand);
    expect(service.isEnabled()).toBe(true);
  });

  it('retains intentional disk mode when no endpoint is configured', async () => {
    const send = jest.spyOn(S3Client.prototype, 'send');
    const service = new ObjectStorageService(new ConfigService({}));

    await expect(service.onModuleInit()).resolves.toBeUndefined();

    expect(service.isEnabled()).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
