import { Logger } from '@nestjs/common';
import type { Repository, DataSource } from 'typeorm';
import * as nodemailer from 'nodemailer';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { AuthService } from './auth.service';
import type { User } from '../entities/user.entity';
import type { UserRole } from '../entities/user-role.entity';
import type { TenantService } from '../tenant/tenant.service';
import type { HrEntityContextService } from '../modules/hr/hr-entity-context.service';
import type { IAuthProvider } from './interfaces/auth-provider.interface';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('synthetic-bcrypt-hash'),
}));
const user = {
  user_id: 'synthetic-user',
  is_active: true,
  official_email: 'canonical@example.test',
  onboarding_profile: { email_pending: false },
};
const tenant = { tenant_id: 'synthetic-tenant', subdomain: 'sgvu' };
const row = {
  token_id: 'synthetic-token-record',
  user_id: user.user_id,
  tenant_id: tenant.tenant_id,
};
type Mail = {
  html: string;
  to: string;
  from: Array<{ name: string; address: string }>;
};
describe('password reset security and delivery failures (offline)', () => {
  const query = jest.fn<Promise<unknown[]>, [string, unknown[]?]>();
  const managerQuery = jest.fn<Promise<unknown>, [string, unknown[]?]>();
  const transaction = jest.fn<
    Promise<unknown>,
    [(manager: { query: typeof managerQuery }) => Promise<unknown>]
  >();
  const sendMail = jest.fn<Promise<unknown>, [Mail]>();
  let service: AuthService;
  let warn: jest.SpyInstance;
  const keys = [
    'EMAIL_HOST',
    'EMAIL_PORT',
    'EMAIL_SECURE',
    'EMAIL_USER',
    'EMAIL_PASSWORD',
    'EMAIL_FROM',
    'FRONTEND_URL',
    'PASSWORD_RESET_EMAIL_FROM_NAME',
    'PASSWORD_RESET_EMAIL_FROM_ADDRESS',
    'FALCON_EXPOSE_DEV_RESET_TOKEN',
    'NODE_ENV',
  ] as const;
  let saved: NodeJS.ProcessEnv;
  beforeEach(() => {
    saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    for (const key of keys) delete process.env[key];
    Object.assign(process.env, {
      EMAIL_HOST: 'smtp.example.test',
      EMAIL_PORT: '587',
      EMAIL_SECURE: 'false',
      EMAIL_USER: 'sender@example.test',
      EMAIL_PASSWORD: 'synthetic-secret',
      EMAIL_FROM: 'sender@example.test',
      FRONTEND_URL: 'http://localhost:3000',
    });
    jest.clearAllMocks();
    query.mockReset();
    managerQuery.mockReset();
    transaction.mockReset();
    sendMail.mockReset().mockResolvedValue({});
    jest
      .mocked(nodemailer.createTransport)
      .mockReturnValue({ sendMail } as unknown as ReturnType<
        typeof nodemailer.createTransport
      >);
    transaction.mockImplementation(async (callback) =>
      callback({ query: managerQuery }),
    );
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    service = new AuthService(
      {} as Repository<User>,
      {} as Repository<UserRole>,
      {} as IAuthProvider,
      {
        findBySubdomain: jest.fn().mockResolvedValue(tenant),
      } as unknown as TenantService,
      { query, transaction } as unknown as DataSource,
      {} as HrEntityContextService,
    );
  });
  afterEach(() => {
    warn.mockRestore();
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });
  const requestUser = () => {
    query.mockResolvedValueOnce([user]).mockResolvedValueOnce([]);
  };
  it('uses the authorized opt-in institutional address only for reset mail', async () => {
    requestUser();
    const sharedFrom = process.env.EMAIL_FROM;
    process.env.PASSWORD_RESET_EMAIL_FROM_ADDRESS =
      'noreply.ums@mygyanvihar.com';
    process.env.PASSWORD_RESET_EMAIL_FROM_NAME = 'An old display name';
    await service.forgotPassword(user.official_email, 'sgvu');
    expect(sendMail.mock.calls[0][0].from).toEqual([
      { name: 'Falcon', address: 'noreply.ums@mygyanvihar.com' },
    ]);
    expect(process.env.EMAIL_FROM).toBe(sharedFrom);
    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.test',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: 'sender@example.test', pass: 'synthetic-secret' },
    });
  });
  it.each([undefined])(
    'uses the institutional sender when the reset-only override is %p',
    async (override) => {
      requestUser();
      if (override !== undefined) {
        process.env.PASSWORD_RESET_EMAIL_FROM_ADDRESS = override;
      }
      await service.forgotPassword(user.official_email, 'sgvu');
      expect(sendMail.mock.calls[0][0].from).toEqual([
        { name: 'Falcon', address: 'noreply.ums@mygyanvihar.com' },
      ]);
      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.example.test',
        port: 587,
        secure: false,
        requireTLS: true,
        auth: { user: 'sender@example.test', pass: 'synthetic-secret' },
      });
    },
  );
  it('keeps SMTP login, shared sender and reset override independent', async () => {
    requestUser();
    process.env.EMAIL_USER = 'smtp-principal@example.test';
    process.env.EMAIL_FROM = 'Shared Notices <notices@example.test>';
    process.env.PASSWORD_RESET_EMAIL_FROM_ADDRESS =
      'noreply.ums@mygyanvihar.com';
    const settingsBefore = Object.fromEntries(
      keys.map((key) => [key, process.env[key]]),
    );

    await service.forgotPassword(user.official_email, 'sgvu');

    expect(sendMail.mock.calls[0][0].from).toEqual([
      { name: 'Falcon', address: 'noreply.ums@mygyanvihar.com' },
    ]);
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: {
          user: 'smtp-principal@example.test',
          pass: 'synthetic-secret',
        },
      }),
    );
    expect(
      Object.fromEntries(keys.map((key) => [key, process.env[key]])),
    ).toEqual(settingsBefore);
  });
  it('rejects a personal Gmail principal before creating any SMTP transport', async () => {
    requestUser();
    process.env.EMAIL_HOST = 'smtp.gmail.com';
    process.env.EMAIL_USER = 'personal@example.test';
    await expect(
      service.forgotPassword(user.official_email, 'sgvu'),
    ).resolves.toEqual({ sent: true });
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      'Password reset email delivery failed (SMTP_FAILURE)',
    );
  });

  it('serializes the exact institutional MIME From without opening SMTP', async () => {
    requestUser();
    process.env.PASSWORD_RESET_EMAIL_FROM_ADDRESS =
      'noreply.ums@mygyanvihar.com';
    const sharedSender = process.env.EMAIL_FROM;
    await service.forgotPassword(user.official_email, 'sgvu');
    const actual = jest.requireActual<typeof nodemailer>('nodemailer');
    const composer = actual.createTransport({
      streamTransport: true,
      buffer: true,
      newline: 'windows',
    });
    // Stream transport renders MIME in memory; no SMTP socket or delivery.
    const result = await composer.sendMail({
      ...sendMail.mock.calls[0][0],
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    const message: unknown = result.message;
    expect(Buffer.isBuffer(message)).toBe(true);
    if (!Buffer.isBuffer(message)) throw new Error('Expected in-memory MIME');
    const from = message
      .toString()
      .split('\r\n')
      .find((line) => line.startsWith('From:'));
    expect(from).toBe('From: Falcon <noreply.ums@mygyanvihar.com>');
    expect(process.env.EMAIL_FROM).toBe(sharedSender);
  });
  it.each([
    '',
    '   ',
    'Falcon <noreply.ums@mygyanvihar.com>',
    'one@example.test,two@example.test',
    'sender@example.test\r\nBcc: other@example.test',
    'invalid-address',
  ])('fails closed for malformed sender configuration', async (override) => {
    requestUser();
    process.env.PASSWORD_RESET_EMAIL_FROM_ADDRESS = override;
    await expect(
      service.forgotPassword(user.official_email, 'sgvu'),
    ).resolves.toEqual({ sent: true });
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      'Password reset email delivery failed (SMTP_FAILURE)',
    );
  });
  it('generates a 192-bit random link, stores only SHA-256 and uses the configured frontend/sender', async () => {
    requestUser();
    await expect(
      service.forgotPassword('CANONICAL@example.test', 'sgvu'),
    ).resolves.toEqual({ sent: true });
    const mail = sendMail.mock.calls[0][0];
    const token =
      mail.html.match(/reset-password\?token=([a-f0-9]+)/)?.[1] ?? '';
    expect(token.length === 48).toBe(true);
    expect(
      mail.html.includes('href="http://localhost:3000/reset-password?token='),
    ).toBe(true);
    const insert = query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO admin_password_reset_tokens'),
    );
    expect(insert?.[0].includes("NOW() + INTERVAL '1 hour'")).toBe(true);
    expect(
      insert?.[1]?.[2] === createHash('sha256').update(token).digest('hex'),
    ).toBe(true);
    expect(insert?.[1]?.includes(token)).toBe(false);
    expect(mail.to).toBe('canonical@example.test');
    expect(mail.from).toEqual([
      { name: 'Falcon', address: 'noreply.ums@mygyanvihar.com' },
    ]);
  });
  it('does not send mail when token persistence fails', async () => {
    query
      .mockResolvedValueOnce([user])
      .mockRejectedValueOnce(new Error('synthetic database failure'));
    await expect(
      service.forgotPassword('canonical@example.test', 'sgvu'),
    ).resolves.toEqual({ sent: true });
    expect(sendMail).not.toHaveBeenCalled();
  });
  it.each(['EAUTH', 'ETIMEDOUT', 'ECONNECTION'])(
    'redacts SMTP %s messages while keeping a generic response',
    async (code) => {
      requestUser();
      sendMail.mockRejectedValue({
        code,
        message: 'SYNTHETIC_PRIVATE_MARKER',
        response: 'SYNTHETIC_PRIVATE_MARKER',
        stack: 'SYNTHETIC_PRIVATE_MARKER',
      });
      await expect(
        service.forgotPassword('canonical@example.test', 'sgvu'),
      ).resolves.toEqual({ sent: true });
      expect(warn).toHaveBeenCalledWith(
        `Password reset email delivery failed (${code})`,
      );
      expect(
        JSON.stringify(warn.mock.calls).includes('SYNTHETIC_PRIVATE_MARKER'),
      ).toBe(false);
    },
  );
  it('redacts unexpected provider codes, exceptions and transport setup failures', async () => {
    requestUser();
    jest.mocked(nodemailer.createTransport).mockImplementation(() => {
      throw Object.assign(new Error('SYNTHETIC_PRIVATE_MARKER'), {
        code: 'SYNTHETIC_PRIVATE_MARKER',
      });
    });
    await expect(
      service.forgotPassword('canonical@example.test', 'sgvu'),
    ).resolves.toEqual({ sent: true });
    expect(warn).toHaveBeenCalledWith(
      'Password reset email delivery failed (SMTP_FAILURE)',
    );
  });
  it('missing SMTP settings do not send or expose account eligibility', async () => {
    delete process.env.EMAIL_PASSWORD;
    requestUser();
    await expect(
      service.forgotPassword('canonical@example.test', 'sgvu'),
    ).resolves.toEqual({ sent: true });
    expect(sendMail).not.toHaveBeenCalled();
  });
  it('unknown, inactive and pending-email accounts have identical public responses', async () => {
    for (const rows of [
      [],
      [{ ...user, is_active: false }],
      [
        {
          ...user,
          official_email: 'pending@example.invalid',
          onboarding_profile: { email_pending: true },
        },
      ],
    ]) {
      query.mockResolvedValueOnce(rows);
      await expect(
        service.forgotPassword(
          'different-' + query.mock.calls.length + '@example.test',
          'sgvu',
        ),
      ).resolves.toEqual({ sent: true });
    }
    expect(sendMail).not.toHaveBeenCalled();
  });
  it.each([
    [[], 'missing'],
    [[{ used: false, expired: true, inactive: false }], 'expired'],
    [[{ used: true, expired: false, inactive: false }], 'consumed'],
    [[{ used: false, expired: false, inactive: true }], 'inactive'],
  ])(
    'rejects %s tokens without account or token writes',
    async (diagnostic) => {
      managerQuery.mockResolvedValueOnce([]).mockResolvedValueOnce(diagnostic);
      await expect(
        service.resetPasswordWithToken('synthetic-token', 'synthetic-password'),
      ).rejects.toThrow('Reset link expired or invalid');
      expect(
        managerQuery.mock.calls.some(([sql]) => /^\s*UPDATE\b/.test(sql)),
      ).toBe(false);
    },
  );
  it.each([
    ['', 'synthetic-password'],
    ['synthetic-token', 'short'],
    ['synthetic-token', ''],
  ])(
    'rejects missing token/weak password before hashing or transactions',
    async (token, password) => {
      await expect(
        service.resetPasswordWithToken(token, password),
      ).rejects.toThrow('Invalid token or password');
      expect(transaction).not.toHaveBeenCalled();
      expect(bcrypt.hash).not.toHaveBeenCalled();
    },
  );
  it('a failed user update cannot consume a token', async () => {
    managerQuery.mockResolvedValueOnce([row]).mockResolvedValueOnce([[], 0]);
    await expect(
      service.resetPasswordWithToken('synthetic-token', 'synthetic-password'),
    ).rejects.toThrow('Reset link expired or invalid');
    expect(
      managerQuery.mock.calls.some(([sql]) =>
        sql.includes('UPDATE admin_password_reset_tokens'),
      ),
    ).toBe(false);
  });
  it('failed token consumption rejects the transaction instead of reporting success', async () => {
    managerQuery
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([[{ user_id: user.user_id }], 1])
      .mockResolvedValueOnce([[], 0]);
    await expect(
      service.resetPasswordWithToken('synthetic-token', 'synthetic-password'),
    ).rejects.toThrow('Reset link expired or invalid');
  });
  it('hashes the password and preserves tenant/role/dept on a flat-array successful transaction', async () => {
    managerQuery
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([{ user_id: user.user_id }])
      .mockResolvedValueOnce([{ token_id: row.token_id }]);
    await expect(
      service.resetPasswordWithToken('synthetic-token', 'synthetic-password'),
    ).resolves.toEqual({ success: true });
    expect(bcrypt.hash).toHaveBeenCalledWith('synthetic-password', 10);
    const update = managerQuery.mock.calls.find(([sql]) =>
      sql.includes('UPDATE users'),
    );
    expect(update?.[1]).toEqual([
      'synthetic-bcrypt-hash',
      user.user_id,
      tenant.tenant_id,
    ]);
    expect(
      /SET[\s\S]*?(role_id|dept_id|tenant_id)\s*=/.test(
        update?.[0].split('WHERE')[0] ?? '',
      ),
    ).toBe(false);
    const lookup = managerQuery.mock.calls[0][0];
    expect(lookup.includes('t.expires_at > NOW()')).toBe(true);
    expect(lookup.includes('u.tenant_id = t.tenant_id')).toBe(true);
    expect(lookup.includes('FOR UPDATE OF t, u')).toBe(true);
  });
});
