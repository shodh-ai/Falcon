import { createHash, sign, verify } from 'crypto';

export function physicalIdentityJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map(physicalIdentityJson).join(',')}]`;
  const source = value as Record<string, unknown>;
  return `{${Object.keys(source)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${physicalIdentityJson(source[key])}`)
    .join(',')}}`;
}

export function physicalIdentityHash(value: unknown) {
  return createHash('sha256')
    .update(
      Buffer.isBuffer(value) ? value : Buffer.from(physicalIdentityJson(value)),
    )
    .digest('hex');
}

export function signPhysicalIdentity(value: unknown, privateKey: string) {
  return sign(
    null,
    Buffer.from(physicalIdentityJson(value)),
    privateKey,
  ).toString('base64url');
}

export function verifyPhysicalIdentity(
  value: unknown,
  signature: string,
  publicKey: string,
) {
  return verify(
    null,
    Buffer.from(physicalIdentityJson(value)),
    publicKey,
    Buffer.from(signature, 'base64url'),
  );
}
