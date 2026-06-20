import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'enc:v1';

@Injectable()
export class HrFieldEncryptionService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const secret =
      config.get<string>('HR_ENCRYPTION_KEY') ??
      config.get<string>('JWT_SECRET') ??
      'local-hr-encryption-key-change-me';
    this.key = scryptSync(secret, 'falcon-hr-pii', 32);
  }

  encrypt(plain: string | null | undefined): string | null {
    if (!plain?.trim()) return null;
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
      PREFIX,
      iv.toString('base64'),
      tag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  decrypt(payload: string | null | undefined): string | null {
    if (!payload?.trim()) return null;
    if (!payload.startsWith(`${PREFIX}:`)) return payload;
    const parts = payload.split(':');
    if (parts.length !== 5) return null;
    const iv = Buffer.from(parts[2], 'base64');
    const tag = Buffer.from(parts[3], 'base64');
    const data = Buffer.from(parts[4], 'base64');
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      'utf8',
    );
  }

  maskPan(value: string | null) {
    if (!value || value.length < 4) return '****';
    return `XXXXX${value.slice(-4)}`;
  }

  maskAadhaar(value: string | null) {
    if (!value || value.length < 4) return 'XXXX-XXXX-****';
    return `XXXX-XXXX-${value.slice(-4)}`;
  }

  maskBank(value: string | null) {
    if (!value || value.length < 4) return '****';
    return `****${value.slice(-4)}`;
  }
}
