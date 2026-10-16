import * as nodemailer from 'nodemailer';
import { lookup } from 'node:dns/promises';
import * as net from 'node:net';
import { EventEmitter } from 'node:events';
import { createStagingNotificationCapture } from './capture';
import { assertNotificationStagingRuntime } from './config';
import { NotificationDeliveryProcessor } from '../core/notifications/notification-delivery.processor';
import { NotificationsService } from '../core/notifications/notifications.service';
import { ConfigService } from '@nestjs/config';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));
jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));
jest.mock('node:net', () => ({
  ...jest.requireActual<typeof import('node:net')>('node:net'),
  connect: jest.fn(),
}));
jest.mock('./config', () => ({
  ...jest.requireActual<typeof import('./config')>('./config'),
  assertNotificationStagingRuntime: jest.fn(),
}));

describe('explicit capture-only notification delivery (offline)', () => {
  const sendMail = jest.fn();
  const close = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(assertNotificationStagingRuntime)
      .mockImplementation(() => undefined);
    jest
      .mocked(nodemailer.createTransport)
      .mockReturnValue({ sendMail, close } as unknown as ReturnType<
        typeof nodemailer.createTransport
      >);
    sendMail.mockResolvedValue({
      accepted: ['notification-staging@example.invalid'],
    });
  });
  it('does not connect, resolve DNS or create a transporter while preparing', () => {
    createStagingNotificationCapture().validateConfiguration();
    expect(lookup).not.toHaveBeenCalled();
    expect(net.connect).not.toHaveBeenCalled();
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });
  it('uses only the fixed Mailpit target, final sender, envelope and synthetic recipient', async () => {
    await createStagingNotificationCapture().send(
      ['notification-staging@example.invalid'],
      'Notice',
      'Text',
    );
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'falcon-notification-staging-mail',
        port: 1025,
        secure: false,
        ignoreTLS: true,
        disableFileAccess: true,
        disableUrlAccess: true,
        getSocket: expect.any(Function) as unknown,
      }),
    );
    expect(
      jest.mocked(nodemailer.createTransport).mock.calls[0][0],
    ).not.toHaveProperty('auth');
    expect(sendMail).toHaveBeenCalledWith({
      from: 'Falcon <noreply.ums@mygyanvihar.com>',
      to: ['notification-staging@example.invalid'],
      envelope: {
        from: 'noreply.ums@mygyanvihar.com',
        to: ['notification-staging@example.invalid'],
      },
      subject: 'Notice',
      text: 'Text',
    });
    expect(close).toHaveBeenCalledTimes(1);
  });
  it.each([
    { to: [] },
    { to: ['real@example.com'] },
    { to: ['notification-staging@example.invalid', 'real@example.com'] },
    { to: ['Notification-staging@example.invalid'] },
    { to: ['notification-staging@example.invalid\r\nBcc:real@example.com'] },
  ])(
    'rejects unapproved recipients %# before transporter creation',
    async ({ to }) => {
      await expect(
        createStagingNotificationCapture().send(to, 'Notice', 'Text'),
      ).rejects.toThrow('Synthetic');
      expect(nodemailer.createTransport).not.toHaveBeenCalled();
    },
  );
  it('sanitizes synchronous socket creation failures without unhandled rejections', async () => {
    await createStagingNotificationCapture().send(
      ['notification-staging@example.invalid'],
      'Notice',
      'Text',
    );
    const options = jest.mocked(nodemailer.createTransport).mock
      .calls[0][0] as {
      getSocket: (_options: unknown, done: (err: Error | null) => void) => void;
    };
    jest
      .mocked(lookup)
      .mockResolvedValue([{ address: '172.30.71.4', family: 4 }] as never);
    jest.mocked(net.connect).mockImplementation(() => {
      throw new Error('private system details');
    });
    const done = jest.fn();
    options.getSocket({}, done);
    await Promise.resolve();
    await Promise.resolve();
    expect(done).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Notification capture socket rejected',
      }),
    );
  });
  it('closes a socket when synchronous setup fails and answers only once', async () => {
    await createStagingNotificationCapture().send(
      ['notification-staging@example.invalid'],
      'Notice',
      'Text',
    );
    const options = jest.mocked(nodemailer.createTransport).mock
      .calls[0][0] as {
      getSocket: (_options: unknown, done: (err: Error | null) => void) => void;
    };
    jest
      .mocked(lookup)
      .mockResolvedValue([{ address: '172.30.71.4', family: 4 }] as never);
    const socket = Object.assign(new EventEmitter(), {
      setTimeout: jest.fn(() => {
        throw new Error('private setup details');
      }),
      destroy: jest.fn(),
    });
    jest.mocked(net.connect).mockReturnValue(socket as never);
    const done = jest.fn();
    options.getSocket({}, done);
    await Promise.resolve();
    await Promise.resolve();
    expect(socket.destroy).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Notification capture socket rejected',
      }),
    );
  });
  it('rechecks the entrypoint guard before every send', async () => {
    const capture = createStagingNotificationCapture();
    jest.mocked(assertNotificationStagingRuntime).mockImplementation(() => {
      throw new Error('Normal runtime');
    });
    await expect(
      capture.send(['notification-staging@example.invalid'], 'Notice', 'Text'),
    ).rejects.toThrow('Normal runtime');
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });
  it('sanitizes provider failures and closes the transport', async () => {
    sendMail.mockRejectedValue(new Error('private provider details'));
    await expect(
      createStagingNotificationCapture().send(
        ['notification-staging@example.invalid'],
        'Notice',
        'Text',
      ),
    ).rejects.toThrow('Notification capture delivery failed');
    expect(close).toHaveBeenCalled();
  });
  it('rejects unexpected DNS answers without opening a socket', async () => {
    await createStagingNotificationCapture().send(
      ['notification-staging@example.invalid'],
      'Notice',
      'Text',
    );
    const options = jest.mocked(nodemailer.createTransport).mock
      .calls[0][0] as {
      getSocket: (_options: unknown, done: (err: Error | null) => void) => void;
    };
    jest
      .mocked(lookup)
      .mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as never);
    const done = jest.fn();
    options.getSocket({}, done);
    await Promise.resolve();
    expect(done).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Notification capture destination rejected',
      }),
    );
    expect(net.connect).not.toHaveBeenCalled();
  });
  it.each([
    { address: '172.30.71.4', port: 1025, accepted: true },
    { address: '172.30.71.3', port: 1025, accepted: false },
    { address: '172.30.71.4', port: 587, accepted: false },
  ])(
    'checks the connected socket identity without external fallback %#',
    async ({ address, port, accepted }) => {
      await createStagingNotificationCapture().send(
        ['notification-staging@example.invalid'],
        'Notice',
        'Text',
      );
      const options = jest.mocked(nodemailer.createTransport).mock
        .calls[0][0] as {
        getSocket: (
          _options: unknown,
          done: (err: Error | null, connection?: unknown) => void,
        ) => void;
      };
      jest
        .mocked(lookup)
        .mockResolvedValue([{ address: '172.30.71.4', family: 4 }] as never);
      const socket = Object.assign(new EventEmitter(), {
        remoteAddress: address,
        remotePort: port,
        setTimeout: jest.fn(),
        destroy: jest.fn(),
      });
      jest.mocked(net.connect).mockReturnValue(socket as never);
      const done = jest.fn();
      options.getSocket({}, done);
      await Promise.resolve();
      expect(net.connect).toHaveBeenCalledWith({
        host: '172.30.71.4',
        port: 1025,
      });
      socket.emit('connect');
      const callbacks = done.mock.calls as unknown as Array<[Error | null]>;
      expect(callbacks[0][0] === null).toBe(accepted);
      if (!accepted) expect(socket.destroy).toHaveBeenCalledTimes(1);
    },
  );
  it('keeps the normal service on institutional validation despite acceptance env flags', () => {
    const service = new NotificationsService({
      get: (key: string) =>
        ({
          EMAIL_HOST: 'falcon-notification-staging-mail',
          EMAIL_PORT: '1025',
          FALCON_NOTIFICATION_STAGING: 'approved',
        })[key],
    } as ConfigService);
    expect(() => service.validateEmailDeliveryConfiguration()).toThrow(
      'Institutional',
    );
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });
  it('allows actual processor startup validation through explicit capture injection only', () => {
    const config = {
      get: (key: string) =>
        ({
          PORTAL_EMAIL_DELIVERY_ENABLED: 'true',
          PORTAL_NOTIFICATION_QUEUE_PREFIX:
            'falcon-notification-staging-offline',
          PORTAL_NOTIFICATION_ACTIVATED_AFTER: '2025-01-01T00:00:00.000Z',
          NODE_ENV: 'production',
          FRONTEND_URL: 'https://staging.example.invalid',
        })[key],
    } as ConfigService;
    const channels = new NotificationsService(
      config,
      createStagingNotificationCapture(),
    );
    const processor = new NotificationDeliveryProcessor(
      channels,
      {} as never,
      config,
    );
    const run = jest.fn().mockResolvedValue(undefined);
    const worker = jest
      .spyOn(processor, 'worker', 'get')
      .mockReturnValue({ run, isRunning: () => false } as never);
    processor.onApplicationBootstrap();
    expect(run).toHaveBeenCalledTimes(1);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    worker.mockRestore();
  });
});
