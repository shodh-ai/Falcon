import { BadRequestException, Injectable } from '@nestjs/common';
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
import type { ProcurementActor } from './procurement.types';
import { hash } from './procurement.util';
import { ProcurementService } from './procurement.service';

const execFileAsync = promisify(execFile);
const ALLOWED_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg']);

type DocumentUploadRow = {
  document_upload_id: string;
  content_hash: string;
  malware_scan_status: string;
  expires_at: string;
};

type InvoiceDocumentRow = {
  document_object_key: string | null;
  mime_type: string | null;
  original_filename: string | null;
};

type InvoiceDownload = {
  stream: Readable;
  mimeType: string;
  filename: string;
};

@Injectable()
export class ProcurementDocumentService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly storage: ObjectStorageService,
    private readonly procurements: ProcurementService,
  ) {}

  private async scan(buffer: Buffer, extension: string) {
    const command =
      process.env.PROCUREMENT_CLAMAV_COMMAND?.trim() ||
      process.env.ACQUISITION_CLAMAV_COMMAND?.trim();
    const required =
      process.env.PROCUREMENT_REQUIRE_MALWARE_SCAN === 'true' ||
      process.env.NODE_ENV === 'production';
    if (!command) {
      if (required)
        throw new BadRequestException({
          message: 'Malware scanner is required but unavailable',
          code: 'MALWARE_SCANNER_UNAVAILABLE',
        });
      return 'CLEAN' as const;
    }
    const dir = await mkdtemp(join(tmpdir(), 'falcon-proc-doc-'));
    const file = join(dir, `invoice${extension}`);
    try {
      await writeFile(file, buffer, { flag: 'wx', mode: 0o600 });
      try {
        await execFileAsync(command, ['--no-summary', file], {
          timeout: 30_000,
          maxBuffer: 512 * 1024,
        });
      } catch {
        throw new BadRequestException({
          message: 'Invoice document failed malware scanning',
          code: 'MALWARE_DETECTED',
        });
      }
      return 'CLEAN' as const;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async upload(
    actor: ProcurementActor,
    caseId: string,
    file: Express.Multer.File,
  ) {
    const access = await this.procurements.authorizeInvoiceEntry(actor, caseId);
    if (!file?.buffer?.length || !ALLOWED_MIME.has(file.mimetype))
      throw new BadRequestException('Invoice must be a PDF, PNG, or JPEG');
    const extension = extname(file.originalname).toLowerCase();
    if (
      (file.mimetype === 'application/pdf' && extension !== '.pdf') ||
      (file.mimetype === 'image/png' && extension !== '.png') ||
      (file.mimetype === 'image/jpeg' && !['.jpg', '.jpeg'].includes(extension))
    )
      throw new BadRequestException(
        'Invoice extension does not match MIME type',
      );
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
    if (!signatureValid)
      throw new BadRequestException('Invoice document signature is invalid');
    const scanStatus = await this.scan(file.buffer, extension);
    const contentHash = hash(file.buffer.toString('base64'));
    const documentId = randomUUID();
    const safeName = `${documentId}${extension}`;
    const objectKey = this.storage.buildKey(
      access.tenant_id,
      `procurements/${caseId}/invoices/${safeName}`,
    );
    await this.storage.upload(
      access.tenant_id,
      objectKey,
      file.buffer,
      file.mimetype,
    );
    const rows = await this.db.query<DocumentUploadRow[]>(
      `INSERT INTO proc_document_uploads
         (document_upload_id,proc_case_id,tenant_id,object_key,original_filename,
          mime_type,byte_size,content_hash,malware_scan_status,uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING document_upload_id,content_hash,malware_scan_status,expires_at`,
      [
        documentId,
        caseId,
        access.tenant_id,
        objectKey,
        file.originalname.slice(0, 255),
        file.mimetype,
        file.size || file.buffer.length,
        contentHash,
        scanStatus,
        actor.user_id,
      ],
    );
    return rows[0];
  }

  async download(
    actor: ProcurementActor,
    caseId: string,
    invoiceId: string,
  ): Promise<InvoiceDownload> {
    const access = await this.procurements.authorizeView(actor, caseId);
    const rows = await this.db.query<InvoiceDocumentRow[]>(
      `SELECT i.document_object_key,u.mime_type,u.original_filename
       FROM proc_invoices i
       LEFT JOIN proc_document_uploads u
         ON u.proc_case_id=i.proc_case_id AND u.content_hash=i.document_hash
       WHERE i.invoice_id=$1 AND i.proc_case_id=$2 AND i.tenant_id=$3`,
      [invoiceId, caseId, access.tenant_id],
    );
    if (!rows[0]?.document_object_key)
      throw new BadRequestException('Invoice document is unavailable');
    return {
      stream: await this.storage.getDownloadStream(rows[0].document_object_key),
      mimeType: rows[0].mime_type ?? 'application/octet-stream',
      filename: rows[0].original_filename ?? 'invoice-document',
    };
  }
}
