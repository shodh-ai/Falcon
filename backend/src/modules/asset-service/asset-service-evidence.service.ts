import { BadRequestException, Injectable } from '@nestjs/common';
import { execFile } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { extname, join } from 'path';
import { promisify } from 'util';
import { ObjectStorageService } from '../../storage/object-storage.service';
import type { AssetServiceActor } from './asset-service.types';
import { AssetServiceService } from './asset-service.service';
import { serviceHash } from './asset-service.util';

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
export class AssetServiceEvidenceService {
  constructor(
    private readonly storage: ObjectStorageService,
    private readonly service: AssetServiceService,
  ) {}
  private validate(file: Express.Multer.File) {
    if (!file?.buffer?.length)
      throw new BadRequestException('Evidence file required');
    const mime = file.mimetype.toLowerCase(),
      extension = extname(file.originalname).toLowerCase(),
      b = file.buffer;
    if (!ALLOWED.has(mime))
      throw new BadRequestException('Unsupported service evidence type');
    const max = mime.startsWith('video/')
      ? 100 * 1024 * 1024
      : 25 * 1024 * 1024;
    if (b.length > max)
      throw new BadRequestException('Evidence exceeds allowed size');
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
        process.env.ASSET_SERVICE_CLAMAV_COMMAND?.trim() ||
        process.env.PROCUREMENT_CLAMAV_COMMAND?.trim(),
      required =
        process.env.ASSET_SERVICE_REQUIRE_MALWARE_SCAN === 'true' ||
        process.env.NODE_ENV === 'production';
    if (!command) {
      if (required)
        throw new BadRequestException('Malware scanner unavailable');
      return;
    }
    const dir = await mkdtemp(join(tmpdir(), 'falcon-service-')),
      target = join(dir, `evidence${extension}`);
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
    actor: AssetServiceActor,
    caseId: string,
    key: string,
    evidenceType: string,
    retentionClass: string | undefined,
    file: Express.Multer.File,
  ) {
    const extension = this.validate(file);
    await this.scan(file.buffer, extension);
    if (!actor.tenant_id)
      throw new BadRequestException('Tenant context required');
    const contentHash = serviceHash(file.buffer),
      objectKey = this.storage.buildKey(
        actor.tenant_id,
        `asset-service/${caseId}/${contentHash}${extension}`,
      );
    await this.storage.upload(
      actor.tenant_id,
      objectKey,
      file.buffer,
      file.mimetype,
    );
    return this.service.registerEvidence(actor, caseId, key, {
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
