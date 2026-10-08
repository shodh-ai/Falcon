import { createHash, sign, verify } from 'crypto';

export function retirementStableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map(retirementStableJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([key, item]) => `${JSON.stringify(key)}:${retirementStableJson(item)}`,
    )
    .join(',')}}`;
}

export function retirementHash(value: unknown) {
  const input = Buffer.isBuffer(value)
    ? value
    : Buffer.from(retirementStableJson(value));
  return createHash('sha256').update(input).digest('hex');
}

export function signRetirementPayload(payload: unknown, privateKey: string) {
  return sign(
    null,
    Buffer.from(retirementStableJson(payload)),
    privateKey,
  ).toString('base64url');
}

export function verifyRetirementPayload(
  payload: unknown,
  signature: string,
  publicKey: string,
) {
  return verify(
    null,
    Buffer.from(retirementStableJson(payload)),
    publicKey,
    Buffer.from(signature, 'base64url'),
  );
}
