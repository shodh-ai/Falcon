import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { extname, join } from 'path';
import type { Readable } from 'stream';
import { promisify } from 'util';
import { DataSource } from 'typeorm';
import { ObjectStorageService } from '../../storage/object-storage.service';
import type { IntegrityActor } from './invoice-integrity.types';
import { integrityHash } from './invoice-integrity.util';
import { InvoiceIntegrityService } from './invoice-integrity.service';

const execFileAsync = promisify(execFile);
const ALLOWED_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg']);

type EvidenceDownloadRow = {
  object_key: string | null;
  evidence_type: string;
  metadata: Record<string, unknown>;
};

@Injectable()
export class InvoiceIntegrityEvidenceService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly storage: ObjectStorageService,
    private readonly integrity: InvoiceIntegrityService,
  ) {}

  private async scan(buffer: Buffer, extension: string) {
    const command =
      process.env.INVOICE_INTEGRITY_CLAMAV_COMMAND?.trim() ||
      process.env.PROCUREMENT_CLAMAV_COMMAND?.trim();
    const required =
      process.env.INVOICE_INTEGRITY_REQUIRE_MALWARE_SCAN === 'true' ||
      process.env.NODE_ENV === 'production';
    if (!command) {
      if (required)
        throw new BadRequestException({
          message: 'Malware scanner is required but unavailable',
          code: 'MALWARE_SCANNER_UNAVAILABLE',
        });
      return;
    }
    const dir = await mkdtemp(join(tmpdir(), 'falcon-inv-evidence-'));
    const target = join(dir, `evidence${extension}`);
    try {
      await writeFile(target, buffer, { flag: 'wx', mode: 0o600 });
      try {
        await execFileAsync(command, ['--no-summary', target], {
          timeout: 30_000,
          maxBuffer: 512 * 1024,
        });
      } catch {
        throw new BadRequestException({
          message: 'Evidence failed malware scanning',
          code: 'MALWARE_DETECTED',
        });
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private validate(file: Express.Multer.File) {
    if (!file?.buffer?.length || !ALLOWED_MIME.has(file.mimetype))
      throw new BadRequestException('Evidence must be a PDF, PNG, or JPEG');
    const extension = extname(file.originalname).toLowerCase();
    const extensionValid =
      (file.mimetype === 'application/pdf' && extension === '.pdf') ||
      (file.mimetype === 'image/png' && extension === '.png') ||
      (file.mimetype === 'image/jpeg' && ['.jpg', '.jpeg'].includes(extension));
    const signatureValid =
      (file.mimetype === 'application/pdf' &&
        file.buffer.subarray(0, 5).toString() === '%PDF-') ||
      (file.mimetype === 'image/png' &&
        file.buffer
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      (file.mimetype === 'image/jpeg' &&
        file.buffer[0] === 0xff &&
        file.buffer[1] === 0xd8);
    if (!extensionValid || !signatureValid)
      throw new BadRequestException(
        'Evidence extension or signature is invalid',
      );
    return extension;
  }

  async upload(
    actor: IntegrityActor,
    caseId: string,
    evidenceType: string,
    file: Express.Multer.File,
  ) {
    const access = await this.integrity.authorizeView(actor, caseId);
    const extension = this.validate(file);
    await this.scan(file.buffer, extension);
    const contentHash = integrityHash(file.buffer.toString('base64'));
    const objectKey = this.storage.buildKey(
      access.tenant_id,
      `invoice-integrity/${caseId}/evidence/${contentHash}/${randomUUID()}${extension}`,
    );
    await this.storage.upload(
      access.tenant_id,
      objectKey,
      file.buffer,
      file.mimetype,
    );
    return this.integrity.registerEvidence(actor, caseId, {
      evidence_type: evidenceType || 'SUPPORTING_DOCUMENT',
      source_method: 'MANUAL_ORIGINAL_UPLOAD',
      object_key: objectKey,
      content_hash: contentHash,
      metadata: {
        original_filename: file.originalname.slice(0, 255),
        mime_type: file.mimetype,
        byte_size: file.size || file.buffer.length,
        malware_scan_status: 'CLEAN',
      },
    });
  }

  async download(
    actor: IntegrityActor,
    caseId: string,
    evidenceId: string,
  ): Promise<{ stream: Readable; mimeType: string; filename: string }> {
    const access = await this.integrity.authorizeView(actor, caseId);
    const rows = await this.db.query<EvidenceDownloadRow[]>(
      `SELECT object_key,evidence_type,metadata FROM inv_evidence
       WHERE evidence_id=$1 AND integrity_case_id=$2 AND tenant_id=$3`,
      [evidenceId, caseId, access.tenant_id],
    );
    const row = rows[0];
    if (!row?.object_key)
      throw new NotFoundException('Evidence file not found');
    const mimeType =
      typeof row.metadata.mime_type === 'string'
        ? row.metadata.mime_type
        : 'application/octet-stream';
    const filename =
      typeof row.metadata.original_filename === 'string'
        ? row.metadata.original_filename
        : `${row.evidence_type}.bin`;
    return {
      stream: await this.storage.getDownloadStream(row.object_key),
      mimeType,
      filename,
    };
  }
}
