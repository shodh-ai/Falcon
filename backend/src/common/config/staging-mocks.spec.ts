import { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import {
  captureStagingIntegration,
  publishStagingOutbox,
} from './staging-mocks';
import { isVerifiedStaging } from './staging-environment';
import { GeminiService } from '../../ai-document/gemini.service';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { IntegrationsService } from '../../modules/integrations/integrations.service';
jest.mock('./staging-environment', () => ({ isVerifiedStaging: jest.fn() }));
jest.mock('fs', () => ({
  ...jest.requireActual<typeof import('fs')>('fs'),
  mkdirSync: jest.fn(),
  lstatSync: () => ({ isDirectory: () => true, isSymbolicLink: () => false }),
  openSync: jest.fn(() => 10),
  closeSync: jest.fn(),
  writeFileSync: jest.fn(),
}));
import { writeFileSync } from 'fs';

describe('isolated staging integration mocks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isVerifiedStaging as jest.Mock).mockReturnValue(true);
  });
  it('never acknowledges production outbox events or writes mock receipts there', async () => {
    (isVerifiedStaging as jest.Mock).mockReturnValue(false);
    const db = { transaction: jest.fn() } as unknown as DataSource;
    expect(await publishStagingOutbox(db, 'proc_outbox_events')).toBe(false);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(() => captureStagingIntegration('sms', {})).toThrow(
      'STAGING_MOCK_BOUNDARY',
    );
    expect(writeFileSync).not.toHaveBeenCalled();
  });
  it('captures before acknowledging; capture failure leaves transaction uncommitted', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { event_id: 'dummy-event', payload: { synthetic: true } },
      ]);
    const db = {
      transaction: (fn: (m: unknown) => unknown) => fn({ query }),
    } as unknown as DataSource;
    (writeFileSync as jest.Mock).mockImplementationOnce(() => {
      throw new Error('disk unavailable');
    });
    await expect(
      publishStagingOutbox(db, 'proc_outbox_events'),
    ).rejects.toThrow('disk unavailable');
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('refuses arbitrary SQL identifiers', async () => {
    await expect(
      publishStagingOutbox({} as DataSource, 'users'),
    ).rejects.toThrow('STAGING_MOCK_OUTBOX');
  });
  it('runs document AI without reading provider credentials or the uploaded PDF', async () => {
    const config = {
      get: jest.fn(() => {
        throw new Error('provider attempted');
      }),
    } as unknown as ConfigService;
    const result = await new GeminiService(config).analyzePdfForTask({
      absolutePdfPath: '/missing.pdf',
      taskName: 'dummy',
    });
    expect(result.extracted_data.staging_mock).toBe(true);
    expect(config.get).not.toHaveBeenCalled();
  });
  it('government integration tests are captured locally without a database or provider call', async () => {
    const db = { query: jest.fn() } as unknown as DataSource;
    const service = new IntegrationsService(db, {} as ConfigService);
    const result = await service.queueGovernmentPush(
      'NAD',
      'synthetic-document',
    );
    expect(result[0].staging_mock).toBe(true);
    expect(db.query).not.toHaveBeenCalled();
    expect(writeFileSync).toHaveBeenCalledWith(
      10,
      expect.stringContaining('government-push'),
    );
  });
  it('keeps SMS in a local staging receipt without a provider', async () => {
    await new NotificationsService({} as ConfigService).sendSms(
      '+10000000000',
      'synthetic',
    );
    expect(writeFileSync).toHaveBeenCalledWith(
      10,
      expect.stringContaining('"kind":"sms"'),
    );
  });
});
