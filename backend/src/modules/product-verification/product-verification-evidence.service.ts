/* eslint-disable @typescript-eslint/no-unsafe-return -- transaction query payload is validated by the domain service */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { execFile } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { extname, join } from 'path';
import type { Readable } from 'stream';
import { promisify } from 'util';
import { DataSource } from 'typeorm';
import { ObjectStorageService } from '../../storage/object-storage.service';
import type {
  CaptureLocation,
  ProductVerificationActor,
} from './product-verification.types';
import { verificationHash } from './product-verification.util';
import { ProductVerificationService } from './product-verification.service';

const execFileAsync = promisify(execFile);
const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const VIDEO_MIME = new Set(['video/mp4', 'video/webm']);

@Injectable()
export class ProductVerificationEvidenceService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly storage: ObjectStorageService,
    private readonly verification: ProductVerificationService,
  ) {}

  private validate(file: Express.Multer.File) {
    if (!file?.buffer?.length)
      throw new BadRequestException('Capture media is required');
    const mime = file.mimetype.toLowerCase();
    const image = IMAGE_MIME.has(mime);
    const video = VIDEO_MIME.has(mime);
    if (!image && !video)
      throw new BadRequestException(
        'Capture must be JPEG, PNG, WebP, MP4, or WebM',
      );
    const max = video ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.buffer.length > max)
      throw new BadRequestException(
        `Capture exceeds the ${video ? '100 MB' : '10 MB'} limit`,
      );
    const extension = extname(file.originalname).toLowerCase();
    const signature = file.buffer;
    const valid =
      (mime === 'image/jpeg' &&
        ['.jpg', '.jpeg'].includes(extension) &&
        signature[0] === 0xff &&
        signature[1] === 0xd8) ||
      (mime === 'image/png' &&
        extension === '.png' &&
        signature
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      (mime === 'image/webp' &&
        extension === '.webp' &&
        signature.subarray(0, 4).toString() === 'RIFF' &&
        signature.subarray(8, 12).toString() === 'WEBP') ||
      (mime === 'video/mp4' &&
        extension === '.mp4' &&
        signature.subarray(4, 8).toString() === 'ftyp') ||
      (mime === 'video/webm' &&
        extension === '.webm' &&
        signature.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])));
    if (!valid)
      throw new BadRequestException(
        'Capture extension or file signature is invalid',
      );
    return {
      extension,
      mediaType: image ? ('IMAGE' as const) : ('VIDEO' as const),
    };
  }

  private async scan(buffer: Buffer, extension: string) {
    const command =
      process.env.PRODUCT_VERIFICATION_CLAMAV_COMMAND?.trim() ||
      process.env.PROCUREMENT_CLAMAV_COMMAND?.trim();
    const required =
      process.env.PRODUCT_VERIFICATION_REQUIRE_MALWARE_SCAN === 'true' ||
      process.env.NODE_ENV === 'production';
    if (!command) {
      if (required)
        throw new BadRequestException({
          message: 'Malware scanner is required but unavailable',
          code: 'MALWARE_SCANNER_UNAVAILABLE',
        });
      return;
    }
    const directory = await mkdtemp(join(tmpdir(), 'falcon-pv-capture-'));
    const target = join(directory, `capture${extension}`);
    try {
      await writeFile(target, buffer, { flag: 'wx', mode: 0o600 });
      try {
        await execFileAsync(command, ['--no-summary', target], {
          timeout: 60_000,
          maxBuffer: 512 * 1024,
        });
      } catch {
        throw new BadRequestException({
          message: 'Capture failed malware scanning',
          code: 'MALWARE_DETECTED',
        });
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  private async sanitizedDerivative(
    buffer: Buffer,
    extension: string,
    mediaType: 'IMAGE' | 'VIDEO',
  ) {
    const command = process.env.PRODUCT_VERIFICATION_FFMPEG_COMMAND?.trim();
    if (!command) return null;
    const directory = await mkdtemp(join(tmpdir(), 'falcon-pv-derivative-'));
    const source = join(directory, `source${extension}`);
    const target = join(directory, `derivative${extension}`);
    try {
      await writeFile(source, buffer, { flag: 'wx', mode: 0o600 });
      const args = ['-nostdin', '-y', '-i', source, '-map_metadata', '-1'];
      if (mediaType === 'VIDEO') args.push('-c', 'copy');
      args.push(target);
      await execFileAsync(command, args, {
        timeout: 60_000,
        maxBuffer: 512 * 1024,
      });
      return await readFile(target);
    } catch {
      return null;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  async upload(
    actor: ProductVerificationActor,
    caseId: string,
    sessionId: string,
    idempotencyKey: string,
    viewType: string,
    nonce: string,
    sessionFingerprint: string,
    location: CaptureLocation,
    clientCapturedAt: string | undefined,
    deviceMetadata: Record<string, unknown>,
    file: Express.Multer.File,
  ) {
    const access = await this.verification.authorizeView(actor, caseId);
    const { extension, mediaType } = this.validate(file);
    await this.scan(file.buffer, extension);
    const contentHash = verificationHash(file.buffer);
    const objectKey = this.storage.buildKey(
      access.tenant_id,
      `product-verification/${caseId}/${sessionId}/${contentHash}${extension}`,
    );
    await this.storage.upload(
      access.tenant_id,
      objectKey,
      file.buffer,
      file.mimetype,
    );
    const derivative = await this.sanitizedDerivative(
      file.buffer,
      extension,
      mediaType,
    );
    const derivativeObjectKey = derivative
      ? this.storage.buildKey(
          access.tenant_id,
          `product-verification/${caseId}/${sessionId}/derivatives/${verificationHash(derivative)}${extension}`,
        )
      : undefined;
    if (derivative && derivativeObjectKey)
      await this.storage.upload(
        access.tenant_id,
        derivativeObjectKey,
        derivative,
        file.mimetype,
      );
    return this.verification.registerEvidence(
      actor,
      caseId,
      sessionId,
      idempotencyKey,
      {
        view_type: viewType,
        media_type: mediaType,
        object_key: objectKey,
        derivative_object_key: derivativeObjectKey,
        content_hash: contentHash,
        byte_size: file.buffer.length,
        mime_type: file.mimetype,
        nonce,
        client_captured_at: clientCapturedAt,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy_metres: location.accuracy_metres,
        session_fingerprint_hash: verificationHash(sessionFingerprint),
        sanitized_device_metadata: deviceMetadata,
        metadata: {
          original_filename: file.originalname.slice(0, 255),
          malware_scan_status: 'CLEAN',
          original_preserved: true,
          metadata_stripping_status: derivative ? 'CLEAN' : 'PENDING',
          privacy_redaction_status: 'PENDING',
          analysis_derivative_status: derivative ? 'READY' : 'PENDING',
        },
      },
    );
  }

  async download(
    actor: ProductVerificationActor,
    caseId: string,
    evidenceId: string,
  ): Promise<{ stream: Readable; mimeType: string; filename: string }> {
    const access = await this.verification.authorizeView(actor, caseId);
    const rows = await this.db.query<
      Array<{
        object_key: string;
        mime_type: string;
        view_type: string;
        media_type: 'IMAGE' | 'VIDEO';
      }>
    >(
      `SELECT object_key,mime_type,view_type,media_type FROM pv_evidence
       WHERE evidence_id=$1 AND verification_case_id=$2 AND tenant_id=$3`,
      [evidenceId, caseId, access.tenant_id],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Capture evidence not found');
    return {
      stream: await this.storage.getDownloadStream(row.object_key),
      mimeType: row.mime_type,
      filename: `${row.view_type}.${row.media_type === 'VIDEO' ? 'bin' : 'img'}`,
    };
  }
}
