import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { NotificationsService } from './notifications.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('NotificationsService institutional email', () => {
  const sendMail = jest.fn();
  let settings: Record<string, unknown>;
  let service: NotificationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    settings = {
      PORTAL_EMAIL_DELIVERY_ENABLED: 'true',
      EMAIL_HOST: 'smtp.gmail.com',
      EMAIL_PORT: '587',
      EMAIL_SECURE: 'false',
      EMAIL_USER: 'noreply.ums@mygyanvihar.com',
      EMAIL_PASSWORD: 'mock-credential-not-valid',
      EMAIL_FROM: 'Legacy Notices <notices@example.test>',
    };
    service = new NotificationsService({
      get: (key: string) => settings[key],
    } as ConfigService);
    jest.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail,
    } as unknown as ReturnType<typeof nodemailer.createTransport>);
    sendMail.mockResolvedValue({ accepted: ['recipient@example.test'] });
  });

  it.each([undefined, 'false', true])(
    'does not create a transport when email delivery is %p',
    async (flag) => {
      settings.PORTAL_EMAIL_DELIVERY_ENABLED = flag;
      await expect(
        service.sendEmail('recipient@example.test', 'Notice', 'Reminder'),
      ).resolves.toBe(false);
      expect(nodemailer.createTransport).not.toHaveBeenCalled();
      expect(sendMail).not.toHaveBeenCalled();
    },
  );

  it('sends email from Falcon using the institutional SMTP account and mandatory TLS', async () => {
    await expect(
      service.sendEmail(
        'recipient@example.test',
        'Fee reminder',
        'Please review your fee due date.',
      ),
    ).resolves.toBe(true);
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        requireTLS: true,
        auth: {
          user: 'noreply.ums@mygyanvihar.com',
          pass: 'mock-credential-not-valid',
        },
      }),
    );
    expect(sendMail).toHaveBeenCalledWith({
      from: 'Falcon <noreply.ums@mygyanvihar.com>',
      to: ['recipient@example.test'],
      subject: 'Fee reminder',
      text: 'Please review your fee due date.',
    });
    expect(settings.EMAIL_FROM).toBe('Legacy Notices <notices@example.test>');
  });

  it('rejects a personal SMTP identity before transport creation', async () => {
    settings.EMAIL_USER = 'personal@example.test';
    await expect(
      service.sendEmail('recipient@example.test', 'Notice', 'Text'),
    ).rejects.toThrow('SMTP_FAILURE');
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    {},
    { accepted: [] },
    { accepted: ['other@example.test'] },
    { accepted: ['recipient@example.test'], rejected: ['other@example.test'] },
    { accepted: ['recipient@example.test'], pending: ['other@example.test'] },
    { accepted: ['recipient@example.test'], rejected: 'provider details' },
  ])(
    'does not claim SMTP acceptance for incomplete or rejected result %#',
    async (result) => {
      sendMail.mockResolvedValue(result);
      await expect(
        service.sendEmail('recipient@example.test', 'Notice', 'Text'),
      ).rejects.toThrow('Portal email delivery failed (SMTP_FAILURE)');
    },
  );

  it('does not report success when only part of a recipient list was accepted', async () => {
    sendMail.mockResolvedValue({ accepted: ['recipient@example.test'] });
    await expect(
      service.sendEmail(
        ['recipient@example.test', 'second@example.test'],
        'Notice',
        'Text',
      ),
    ).rejects.toThrow('SMTP_FAILURE');
  });

  it('accepts only a complete, case-insensitive SMTP recipient confirmation', async () => {
    sendMail.mockResolvedValue({
      accepted: ['RECIPIENT@example.test', 'second@example.test'],
      rejected: [],
      pending: [],
    });
    await expect(
      service.sendEmail(
        ['recipient@example.test', 'second@example.test'],
        'Notice',
        'Text',
      ),
    ).resolves.toBe(true);
  });

  it('does not reveal provider errors in logs or rejected errors', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    sendMail.mockRejectedValue(
      new Error('provider response containing private data'),
    );
    await expect(
      service.sendEmail('recipient@example.test', 'Notice', 'Text'),
    ).rejects.toThrow('Portal email delivery failed (SMTP_FAILURE)');
    expect(warn).toHaveBeenCalledWith(
      'Portal email delivery failed (SMTP_FAILURE)',
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private data');
    warn.mockRestore();
  });

  it('rejects malformed recipients without creating a transport', async () => {
    await expect(
      service.sendEmail(
        'recipient@example.test\r\nBcc: other@example.test',
        'Notice',
        'Text',
      ),
    ).rejects.toThrow('SMTP_FAILURE');
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });
});
