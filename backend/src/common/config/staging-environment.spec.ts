import { isVerifiedStaging } from './staging-environment';
import { falconEmailTransportOptions } from '../email/falcon-email-sender';
import { GatewayPaymentService } from '../../modules/finance/gateway-payment.service';

const staging = {
  FALCON_ENVIRONMENT: 'staging', FALCON_STAGING_VERIFIED: '1', NODE_ENV: 'production',
  DB_HOST: 'falcon-staging-postgres', DB_DATABASE: 'falcon_staging', DB_USERNAME: 'falcon_staging_runtime',
};

describe('verified staging integration isolation', () => {
  const original = process.env;
  beforeEach(() => { process.env = { ...original }; });
  afterEach(() => { process.env = original; });

  it('requires both the launcher proof and explicit staging database identity', () => {
    expect(isVerifiedStaging(staging)).toBe(true);
    for (const key of Object.keys(staging)) {
      expect(isVerifiedStaging({ ...staging, [key]: 'wrong' })).toBe(false);
    }
    expect(isVerifiedStaging({ ...staging, DB_DATABASE: 'postgres' })).toBe(false);
  });

  it('captures institutional email inside staging with mandatory trusted STARTTLS', () => {
    Object.assign(process.env, staging);
    const values: Record<string, string> = {
      EMAIL_HOST: 'falcon-staging-mail', EMAIL_PORT: '1025', EMAIL_SECURE: 'false',
      EMAIL_USER: 'noreply.ums@mygyanvihar.com', EMAIL_PASSWORD: 'synthetic-only-credential-12345678901234567890',
    };
    expect(falconEmailTransportOptions(k => values[k])).toMatchObject({
      host: 'falcon-staging-mail', port: 1025, secure: false, requireTLS: true,
      disableFileAccess: true, disableUrlAccess: true,
    });
    for (const key of ['EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_SECURE']) {
      expect(() => falconEmailTransportOptions(k => k === key ? 'wrong' : values[k])).toThrow();
    }
  });

  it('a staging label alone cannot enable the capture transport in production', () => {
    Object.assign(process.env, staging, { DB_DATABASE: 'postgres' });
    expect(() => falconEmailTransportOptions(k => ({ EMAIL_HOST: 'falcon-staging-mail' })[k])).toThrow();
  });

  it('creates local payment orders in verified staging while keeping production refusals', async () => {
    Object.assign(process.env, staging, { ALLOW_MOCK_PAYMENTS: 'true' });
    delete process.env.RAZORPAY_KEY_ID; delete process.env.RAZORPAY_KEY_SECRET;
    const service = new GatewayPaymentService();
    expect(service.mockPaymentsAllowed()).toBe(true);
    const result = await service.createOrder({ amountInr: 10, receipt: 'synthetic-only', notes: {} });
    expect(result.mock).toBe(true); expect(result.order_id).toMatch(/^order_mock_/);
    process.env.DB_DATABASE = 'postgres';
    expect(service.mockPaymentsAllowed()).toBe(false);
    await expect(service.createOrder({ amountInr: 10, receipt: 'synthetic-only', notes: {} })).rejects.toThrow();
  });
});
