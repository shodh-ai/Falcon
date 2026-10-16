import {
  FALCON_EMAIL_FROM,
  falconEmailTransportOptions,
  portalEmailDeliveryEnabled,
  safeEmailRecipient,
} from './falcon-email-sender';

const approved: Record<string, unknown> = {
  EMAIL_HOST: 'smtp.gmail.com',
  EMAIL_PORT: '587',
  EMAIL_SECURE: 'false',
  EMAIL_USER: 'noreply.ums@mygyanvihar.com',
  EMAIL_PASSWORD: 'mock-credential-not-valid',
  EMAIL_FROM: 'Legacy Notices <notices@example.test>',
};

describe('institutional portal sender policy', () => {
  it('uses exactly Falcon and the institutional identity without changing config', () => {
    const input = { ...approved };
    expect(FALCON_EMAIL_FROM).toBe('Falcon <noreply.ums@mygyanvihar.com>');
    expect(falconEmailTransportOptions((key) => input[key])).toEqual({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      auth: {
        user: 'noreply.ums@mygyanvihar.com',
        pass: 'mock-credential-not-valid',
      },
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    expect(input).toEqual(approved);
  });

  it('supports approved implicit TLS without a plaintext fallback', () => {
    const input = { ...approved, EMAIL_PORT: '465', EMAIL_SECURE: 'true' };
    expect(falconEmailTransportOptions((key) => input[key])).toMatchObject({
      port: 465,
      secure: true,
      requireTLS: true,
    });
  });

  it.each([
    ['EMAIL_USER', 'personal@example.test'],
    ['EMAIL_USER', ''],
    ['EMAIL_PASSWORD', ''],
    ['EMAIL_HOST', 'smtp.other.test'],
    ['EMAIL_PORT', '25'],
    ['EMAIL_PORT', '587x'],
    ['EMAIL_PORT', '465'],
    ['EMAIL_SECURE', 'true'],
    ['EMAIL_SECURE', 'invalid'],
  ])('rejects unsafe configuration for %s', (key, value) => {
    const input = { ...approved, [key]: value };
    expect(() => falconEmailTransportOptions((name) => input[name])).toThrow(
      'Institutional email configuration is unavailable',
    );
  });

  it.each([undefined, false, true, 'false', 'TRUE', '1'])(
    '%p cannot enable queued email',
    (flag) => {
      expect(portalEmailDeliveryEnabled(() => flag)).toBe(false);
    },
  );

  it('requires the explicit email delivery flag', () => {
    expect(portalEmailDeliveryEnabled(() => 'true')).toBe(true);
  });

  it.each([
    'Name <recipient@example.test>',
    'recipient@example.test\r\nBcc: other@example.test',
    'recipient@example.test,other@example.test',
    'missing-domain',
    null,
  ])('rejects malformed envelope addresses', (value) => {
    expect(safeEmailRecipient(value)).toBe(false);
  });
});
