import { BadRequestException, Injectable } from '@nestjs/common';
import { execFile } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { extname, join } from 'path';
import { promisify } from 'util';
import { ObjectStorageService } from '../../storage/object-storage.service';
import type { InventoryActor } from '../inventory/inventory.types';
import { ReturnsService } from './returns.service';
import { returnHash } from './returns.util';

const execFileAsync = promisify(execFile);
const ALLOWED = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
  'application/pdf',
]);

@Injectable()
export class ReturnsEvidenceService {
  constructor(
    private readonly storage: ObjectStorageService,
    private readonly returns: ReturnsService,
  ) {}
  private validate(file: Express.Multer.File) {
    if (!file?.buffer?.length)
      throw new BadRequestException('Evidence file required');
    const mime = file.mimetype.toLowerCase(),
      extension = extname(file.originalname).toLowerCase();
    if (!ALLOWED.has(mime))
      throw new BadRequestException(
        'Evidence must be JPEG, PNG, WebP, MP4, WebM, or PDF',
      );
    const max = mime.startsWith('video/')
      ? 100 * 1024 * 1024
      : 25 * 1024 * 1024;
    if (file.buffer.length > max)
      throw new BadRequestException('Evidence exceeds allowed size');
    const b = file.buffer;
    const valid =
      (mime === 'image/jpeg' &&
        ['.jpg', '.jpeg'].includes(extension) &&
        b[0] === 0xff &&
        b[1] === 0xd8) ||
      (mime === 'image/png' &&
        extension === '.png' &&
        b
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      (mime === 'image/webp' &&
        extension === '.webp' &&
        b.subarray(0, 4).toString() === 'RIFF' &&
        b.subarray(8, 12).toString() === 'WEBP') ||
      (mime === 'video/mp4' &&
        extension === '.mp4' &&
        b.subarray(4, 8).toString() === 'ftyp') ||
      (mime === 'video/webm' &&
        extension === '.webm' &&
        b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) ||
      (mime === 'application/pdf' &&
        extension === '.pdf' &&
        b.subarray(0, 5).toString() === '%PDF-');
    if (!valid)
      throw new BadRequestException(
        'Evidence extension or signature is invalid',
      );
    return extension;
  }
  private async scan(buffer: Buffer, extension: string) {
    const command =
      process.env.RETURNS_CLAMAV_COMMAND?.trim() ||
      process.env.PROCUREMENT_CLAMAV_COMMAND?.trim();
    const required =
      process.env.RETURNS_REQUIRE_MALWARE_SCAN === 'true' ||
      process.env.NODE_ENV === 'production';
    if (!command) {
      if (required)
        throw new BadRequestException('Malware scanner unavailable');
      return;
    }
    const dir = await mkdtemp(join(tmpdir(), 'falcon-return-'));
    const target = join(dir, `evidence${extension}`);
    try {
      await writeFile(target, buffer, { flag: 'wx', mode: 0o600 });
      await execFileAsync(command, ['--no-summary', target], {
        timeout: 60000,
        maxBuffer: 512 * 1024,
      });
    } catch {
      throw new BadRequestException('Evidence failed malware scanning');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  async upload(
    actor: InventoryActor,
    caseId: string,
    key: string,
    evidenceType: string,
    retentionClass: string | undefined,
    file: Express.Multer.File,
  ) {
    const extension = this.validate(file);
    await this.scan(file.buffer, extension);
    const tenant = actor.tenant_id;
    if (!tenant) throw new BadRequestException('Tenant context required');
    const contentHash = returnHash(file.buffer),
      objectKey = this.storage.buildKey(
        tenant,
        `returns/${caseId}/${contentHash}${extension}`,
      );
    await this.storage.upload(tenant, objectKey, file.buffer, file.mimetype);
    return this.returns.registerEvidence(actor, caseId, key, {
      evidence_type: evidenceType,
      object_key: objectKey,
      content_hash: contentHash,
      mime_type: file.mimetype,
      byte_size: file.buffer.length,
      retention_class: retentionClass,
      metadata: {
        original_filename: file.originalname.slice(0, 255),
        malware_scan_status: 'CLEAN',
        original_preserved: true,
      },
    });
  }
}
