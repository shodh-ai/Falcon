import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ObjectStorageService } from './object-storage.service';

describe('create-only object storage (S3 transport mocked, no live bucket)', () => {
  afterEach(() => jest.restoreAllMocks());
  const tenant = '11111111-1111-4111-8111-111111111111';
  const key = `${tenant}/exam-cell/issued-hall-tickets/fixture.pdf`;
  const storage = () =>
    new ObjectStorageService(
      new ConfigService({
        S3_ENDPOINT: 'http://unused.invalid',
        S3_BUCKET: 'test-only',
      }),
    );

  it('requires conditional creation rather than overwriting a key', async () => {
    const send = jest
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValue({} as never);
    await storage().uploadNew(
      tenant,
      key,
      Buffer.from('%PDF-fixture'),
      'application/pdf',
    );
    const command = send.mock.calls[0][0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'test-only',
      Key: key,
      IfNoneMatch: '*',
    });
  });

  it('propagates upload failures and never retries with an unconditional write', async () => {
    const failure = new Error('Conditional upload unavailable');
    const send = jest
      .spyOn(S3Client.prototype, 'send')
      .mockRejectedValue(failure as never);
    await expect(
      storage().uploadNew(tenant, key, Buffer.from('pdf'), 'application/pdf'),
    ).rejects.toBe(failure);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each([
    'other/file.pdf',
    `${tenant}/../escape.pdf`,
    `${tenant}/a\\escape.pdf`,
  ])('rejects an invalid key before storage access: %s', async (invalid) => {
    const send = jest.spyOn(S3Client.prototype, 'send');
    await expect(
      storage().uploadNew(
        tenant,
        invalid,
        Buffer.from('pdf'),
        'application/pdf',
      ),
    ).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
});
