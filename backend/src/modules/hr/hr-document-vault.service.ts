import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Response } from 'express';
import { ObjectStorageService } from '../../storage/object-storage.service';
import {
  HR_DOCUMENT_CATEGORIES,
  HR_DOCUMENT_GROUP_MAP,
} from './hr-document.constants';
import { parseStorageKey } from './utils/s3-key.util';
import {
  openDocumentReadStream,
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

    const status = options?.autoVerify ? 'VERIFIED' : 'PENDING';
    const fileName =
      dto.file_name?.trim() ||
      dto.file_url.split('/').pop()?.split('?')[0] ||
      'document';

    const rows = await this.dataSource.query(
      `INSERT INTO hr_employee_documents
         (tenant_id, entity_id, user_id, document_type, file_url, file_name, uploaded_by, verification_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING document_id, document_type, file_name, verification_status, uploaded_at`,
      [
        tenantId,
        entityId,
        userId,
        docType,
        dto.file_url,
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
    hrUserId: string,
  ) {
    if (!['VERIFIED', 'REJECTED'].includes(status)) {
      throw new BadRequestException('status must be VERIFIED or REJECTED');
    }
    const rows = await this.dataSource.query(
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

    const key = parseStorageKey(doc.file_url);
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

    if (
      doc.file_url.startsWith('http://') ||
      doc.file_url.startsWith('https://')
    ) {
      return {
        url: doc.file_url,
        delivery: 'presigned' as const,
        expires_at: new Date(
          Date.now() + PRESIGNED_TTL_SECONDS * 1000,
        ).toISOString(),
        file_name: doc.file_name,
      };
    }

    if (
      resolveDocumentDiskPath(doc.file_url) ||
      (key && !this.storage.isEnabled())
    ) {
      return {
        url: `/api/hr/documents/${docId}/file`,
        delivery: 'authenticated' as const,
        expires_at: new Date(
          Date.now() + PRESIGNED_TTL_SECONDS * 1000,
        ).toISOString(),
        file_name: doc.file_name,
      };
    }

    if (
      doc.file_url.startsWith('/') ||
      doc.file_url.includes('uploads/download')
    ) {
      return {
        url: doc.file_url.startsWith('http')
          ? doc.file_url
          : `/api/uploads/download?key=${encodeURIComponent(key ?? '')}`,
        delivery: 'presigned' as const,
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

    const stream = await openDocumentReadStream(doc.file_url, this.storage);
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
