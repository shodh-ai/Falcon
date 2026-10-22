import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Response } from 'express';
import { accessSync, constants } from 'fs';
import { ObjectStorageService } from '../../storage/object-storage.service';
import {
  HR_DOCUMENT_CATEGORIES,
  HR_DOCUMENT_GROUP_MAP,
} from './hr-document.constants';
import {
  openDocumentReadStream,
  parseTenantStorageKey,
  resolveDocumentDiskPath,
} from './utils/document-file-path.util';

const PRESIGNED_TTL_SECONDS = 900;

export type DocumentRow = {
  document_id: string;
  document_type: string;
  file_name: string | null;
  verification_status: string;
  uploaded_at: string;
  uploaded_by_name?: string | null;
};

@Injectable()
export class HrDocumentVaultService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly storage: ObjectStorageService,
  ) {}

  async listDocuments(tenantId: string, userId: string, entityId?: number) {
    const params: unknown[] = [tenantId, userId];
    let entityClause = '';
    if (entityId != null) {
      params.push(entityId);
      entityClause = ` AND (d.entity_id = $3 OR d.entity_id IS NULL)`;
    }
    const rows = await this.dataSource.query<DocumentRow[]>(
      `SELECT d.document_id, d.document_type, d.file_name, d.verification_status, d.uploaded_at,
              uploader.name AS uploaded_by_name
       FROM hr_employee_documents d
       LEFT JOIN users uploader ON uploader.user_id = d.uploaded_by
       WHERE d.tenant_id = $1 AND d.user_id = $2${entityClause}
       ORDER BY d.uploaded_at DESC`,
      params,
    );

    const groups: Record<string, DocumentRow[]> = {
      Identity: [],
      Academic: [],
      Financial: [],
      'HR Letters': [],
      Other: [],
    };
    for (const row of rows) {
      const group = HR_DOCUMENT_GROUP_MAP[row.document_type] ?? 'Other';
      groups[group].push(row);
    }
    return { documents: rows, groups, categories: HR_DOCUMENT_CATEGORIES };
  }

  async uploadDocument(
    tenantId: string,
    entityId: number,
    userId: string,
    uploadedBy: string,
    dto: { document_type: string; file_url: string; file_name?: string },
    options?: { autoVerify?: boolean },
  ) {
    const docType = dto.document_type?.trim().toUpperCase();
    if (!docType) throw new BadRequestException('document_type is required');
    if (!dto.file_url?.trim())
      throw new BadRequestException('file_url is required');

    const fileUrl = dto.file_url.trim();
    const key = parseTenantStorageKey(
      fileUrl,
      tenantId,
      this.storage.getBucketName(),
    );
    const localFile = resolveDocumentDiskPath(
      key && !this.storage.isEnabled() ? `/uploads/${key}` : fileUrl, tenantId,
    );
    if ((!key || !this.storage.isEnabled()) && !localFile) {
      throw new BadRequestException(
        "Document must reference an uploaded file in this tenant's secure storage",
      );
    }

    try {
      if (key && this.storage.isEnabled()) await this.storage.assertObjectExists(key);
      else if (localFile) accessSync(localFile, constants.R_OK);
      else throw new Error('File unavailable');
    } catch {
      throw new BadRequestException('The uploaded file is missing or unreadable. Upload it again before saving the document.');
    }

    const status = options?.autoVerify ? 'VERIFIED' : 'PENDING';
    const fileName =
      dto.file_name?.trim() ||
      fileUrl.split('/').pop()?.split('?')[0] ||
      'document';

    const rows = await this.dataSource.query<
      Array<{
        document_id: string;
        document_type: string;
        file_name: string;
        verification_status: string;
        uploaded_at: string;
      }>
    >(
      `INSERT INTO hr_employee_documents
         (tenant_id, entity_id, user_id, document_type, file_url, file_name, uploaded_by, verification_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING document_id, document_type, file_name, verification_status, uploaded_at`,
      [
        tenantId,
        entityId,
        userId,
        docType,
        key && this.storage.isEnabled() ? `s3://${this.storage.getBucketName()}/${key}` : key ? `/uploads/${key}` : fileUrl,
        fileName,
        uploadedBy,
        status,
      ],
    );
    return rows[0];
  }

  async verifyDocument(
    tenantId: string,
    docId: string,
    status: 'VERIFIED' | 'REJECTED',
    _hrUserId: string,
  ) {
    // The controller checks reviewer permissions; the current document schema
    // does not persist reviewer identity here.
    void _hrUserId;
    if (!['VERIFIED', 'REJECTED'].includes(status)) {
      throw new BadRequestException('status must be VERIFIED or REJECTED');
    }
    const rows = await this.dataSource.query<
      Array<{
        document_id: string;
        document_type: string;
        file_name: string;
        verification_status: string;
        uploaded_at: string;
      }>
    >(
      `UPDATE hr_employee_documents SET verification_status = $3
       WHERE document_id = $1 AND tenant_id = $2
       RETURNING document_id, document_type, file_name, verification_status, uploaded_at`,
      [docId, tenantId, status],
    );
    if (!rows[0]) throw new NotFoundException('Document not found');
    return rows[0];
  }

  async getSecureDownloadUrl(
    tenantId: string,
    docId: string,
    requesterId: string,
    isHr: boolean,
  ) {
    const rows = await this.dataSource.query<
      Array<{ user_id: string; file_url: string; file_name: string | null }>
    >(
      `SELECT user_id, file_url, file_name FROM hr_employee_documents
       WHERE document_id = $1 AND tenant_id = $2`,
      [docId, tenantId],
    );
    const doc = rows[0];
    if (!doc) throw new NotFoundException('Document not found');
    if (!isHr && doc.user_id !== requesterId) {
      throw new ForbiddenException('You can only download your own documents');
    }

    const key = parseTenantStorageKey(
      doc.file_url,
      tenantId,
      this.storage.getBucketName(),
    );
    if (key && this.storage.isEnabled()) {
      const url = await this.storage.getPresignedDownloadUrl(
        key,
        PRESIGNED_TTL_SECONDS,
      );
      return {
        url,
        delivery: 'presigned' as const,
        expires_at: new Date(
          Date.now() + PRESIGNED_TTL_SECONDS * 1000,
        ).toISOString(),
        file_name: doc.file_name,
      };
    }

    if (resolveDocumentDiskPath(doc.file_url, tenantId)) {
      return {
        url: `/api/hr/documents/${docId}/file`,
        delivery: 'authenticated' as const,
        expires_at: new Date(
          Date.now() + PRESIGNED_TTL_SECONDS * 1000,
        ).toISOString(),
        file_name: doc.file_name,
      };
    }

    throw new NotFoundException(
      'Document file not available in secure storage',
    );
  }

  async pipeDocumentFile(
    tenantId: string,
    docId: string,
    requesterId: string,
    isHr: boolean,
    res: Response,
  ): Promise<void> {
    const rows = await this.dataSource.query<
      Array<{ user_id: string; file_url: string; file_name: string | null }>
    >(
      `SELECT user_id, file_url, file_name FROM hr_employee_documents
       WHERE document_id = $1 AND tenant_id = $2`,
      [docId, tenantId],
    );
    const doc = rows[0];
    if (!doc) throw new NotFoundException('Document not found');
    if (!isHr && doc.user_id !== requesterId) {
      throw new ForbiddenException('You can only download your own documents');
    }

    const stream = await openDocumentReadStream(
      doc.file_url,
      this.storage,
      tenantId,
    );
    if (!stream) {
      throw new NotFoundException(
        'Document file not available in secure storage',
      );
    }

    const fileName = doc.file_name ?? 'document';
    const lower = fileName.toLowerCase();
    const contentType = lower.endsWith('.pdf')
      ? 'application/pdf'
      : lower.endsWith('.png')
        ? 'image/png'
        : lower.endsWith('.jpg') || lower.endsWith('.jpeg')
          ? 'image/jpeg'
          : 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    stream.pipe(res);
  }
}
