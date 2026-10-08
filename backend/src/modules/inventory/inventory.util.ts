import { createHash, sign, verify } from 'crypto';

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(',')}}`;
}

export function inventoryHash(value: unknown) {
  return createHash('sha256')
    .update(Buffer.from(canonicalJson(value)))
    .digest('hex');
}

export function signInventoryIdentity(payload: unknown, privateKey: string) {
  return sign(null, Buffer.from(canonicalJson(payload)), privateKey).toString(
    'base64url',
  );
}

export function verifyInventoryIdentity(
  payload: unknown,
  signature: string,
  publicKey: string,
) {
  return verify(
    null,
    Buffer.from(canonicalJson(payload)),
    publicKey,
    Buffer.from(signature, 'base64url'),
  );
}

export function normalizedSerial(value?: string) {
  const normalized = value
    ?.trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return normalized || null;
}

export function renderIdentifier(
  pattern: string,
  tenant: string,
  sequence: number,
  now = new Date(),
) {
  return pattern
    .replaceAll(
      '{tenant}',
      tenant
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 12),
    )
    .replaceAll('{yyyy}', String(now.getUTCFullYear()))
    .replaceAll(
      '{yyyymm}',
      `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
    )
    .replaceAll('{seq6}', String(sequence).padStart(6, '0'));
}
