export const FALCON_EMAIL_ADDRESS = 'noreply.ums@mygyanvihar.com';
export const FALCON_EMAIL_FROM = `Falcon <${FALCON_EMAIL_ADDRESS}>`;

export type FalconEmailConfigReader = (name: string) => unknown;

/** Resolve only the approved institutional SMTP path; never alter shared config. */
export function falconEmailTransportOptions(read: FalconEmailConfigReader) {
  const host = read('EMAIL_HOST');
  const user = read('EMAIL_USER');
  const pass = read('EMAIL_PASSWORD');
  const rawPort = read('EMAIL_PORT') ?? '587';
  const rawSecure = read('EMAIL_SECURE') ?? 'false';
  const port = Number(rawPort);
  const secure = rawSecure === true || rawSecure === 'true';
  if (
    typeof host !== 'string' ||
    host.trim().toLowerCase() !== 'smtp.gmail.com' ||
    typeof user !== 'string' ||
    user.trim().toLowerCase() !== FALCON_EMAIL_ADDRESS ||
    typeof pass !== 'string' ||
    pass.length === 0 ||
    !(
      (typeof rawPort === 'string' || typeof rawPort === 'number') &&
      ['587', '465'].includes(String(rawPort))
    ) ||
    ![true, false, 'true', 'false'].includes(rawSecure as string | boolean) ||
    (port === 587 && secure) ||
    (port === 465 && !secure)
  ) {
    throw new Error('Institutional email configuration is unavailable');
  }
  return {
    host: 'smtp.gmail.com',
    port,
    secure,
    requireTLS: true,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    auth: { user: FALCON_EMAIL_ADDRESS, pass },
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}

export function portalEmailDeliveryEnabled(read: FalconEmailConfigReader) {
  return read('PORTAL_EMAIL_DELIVERY_ENABLED') === 'true';
}

export function safeEmailRecipient(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 254 &&
    /^[^<>\s@,;]+@[^<>\s@,;]+\.[^<>\s@,;]+$/.test(value)
  );
}
