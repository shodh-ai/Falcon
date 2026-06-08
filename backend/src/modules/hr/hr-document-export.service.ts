import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import type { Response } from 'express';
import { Readable } from 'stream';
// archiver v8 exposes ZipArchive as a class (not a factory function).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ZipArchive } = require('archiver') as typeof import('archiver');
import { ObjectStorageService } from '../../storage/object-storage.service';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import {
  HR_DOCUMENT_EXPORT_QUEUE,
  type HrDocumentExportJob,
} from '../../common/constants/hr-export-queue.constants';
import {
  openDocumentReadStream,
  uploadRoot,
} from './utils/document-file-path.util';

@Injectable()
export class HrDocumentExportService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectQueue(HR_DOCUMENT_EXPORT_QUEUE) private readonly exportQueue: Queue,
    private readonly storage: ObjectStorageService,
    private readonly notify: NotificationEmitterService,
  ) {}

  async createExportJob(
    tenantId: string,
    entityId: number,
    requestedBy: string,
    filters: HrDocumentExportJob['filters'],
  ) {
    const documentCount = await this.countMatchingDocuments(tenantId, entityId, filters);
    if (documentCount === 0) {
      throw new BadRequestException(
        'No documents matched the selected filters. Upload documents to the employee vault first.',
      );
    }

    const rows = await this.dataSource.query(
      `INSERT INTO hr_document_export_jobs (tenant_id, entity_id, requested_by, filters, status)
       VALUES ($1, $2, $3, $4::jsonb, 'QUEUED')
       RETURNING job_id`,
      [tenantId, entityId, requestedBy, JSON.stringify(filters)],
    );
    const jobId = rows[0].job_id as string;
    await this.exportQueue.add('export', {
      jobId,
      tenantId,
      entityId,
      requestedBy,
      filters,
    } satisfies HrDocumentExportJob);
    return {
      job_id: jobId,
      document_count: documentCount,
      message: 'Export queued. You will receive a notification when the archive is ready.',
    };
  }

  private async countMatchingDocuments(
    tenantId: string,
    entityId: number,
    filters: HrDocumentExportJob['filters'],
  ): Promise<number> {
    const { sql, params } = this.buildDocumentFilterQuery(tenantId, entityId, filters, 'COUNT(*)::int AS cnt');
    const rows = await this.dataSource.query<Array<{ cnt: number }>>(sql, params);
    return rows[0]?.cnt ?? 0;
  }

  private buildDocumentFilterQuery(
    tenantId: string,
    entityId: number,
    filters: HrDocumentExportJob['filters'],
    select: string,
  ) {
    const isAll = filters.document_type === 'ALL';
    const params: unknown[] = isAll ? [tenantId] : [tenantId, filters.document_type];
    let idx = isAll ? 2 : 3;
    let deptClause = '';
    let roleClause = '';
    let entityClause = '';
    const typeClause = isAll ? '' : ' AND d.document_type = $2';

    if (filters.dept_id != null) {
      deptClause = ` AND u.dept_id = $${idx}`;
      params.push(filters.dept_id);
      idx++;
    }
    if (filters.role_id != null) {
      roleClause = ` AND u.role_id = $${idx}`;
      params.push(filters.role_id);
      idx++;
    }
    if (entityId != null) {
      entityClause = ` AND (d.entity_id = $${idx} OR d.entity_id IS NULL)`;
      params.push(entityId);
    }

    const sql = `SELECT ${select}
         FROM hr_employee_documents d
         JOIN users u ON u.user_id = d.user_id
         LEFT JOIN hr_employee_profiles p ON p.user_id = d.user_id AND p.tenant_id = d.tenant_id
         WHERE d.tenant_id = $1${typeClause}${deptClause}${roleClause}${entityClause}`;
    return { sql, params };
  }

  async getExportJob(tenantId: string, jobId: string, requesterId: string) {
    const job = await this.loadExportJobRow(tenantId, jobId, requesterId);

    let download_url: string | null = null;
    if (job.status === 'COMPLETED' && job.file_key) {
      if (this.storage.isEnabled()) {
        download_url = await this.storage.getPresignedDownloadUrl(job.file_key, 900);
      } else {
        download_url = `/api/hr/documents/export-jobs/${jobId}/download`;
      }
    }

    return {
      job_id: job.job_id,
      status: job.status,
      file_name: job.file_name,
      error_message: job.error_message,
      created_at: job.created_at,
      completed_at: job.completed_at,
      download_url,
    };
  }

  async pipeExportDownload(
    tenantId: string,
    jobId: string,
    requesterId: string,
    res: Response,
  ): Promise<void> {
    const job = await this.loadExportJobRow(tenantId, jobId, requesterId);
    if (job.status !== 'COMPLETED' || !job.file_key) {
      throw new NotFoundException(
        job.status === 'FAILED'
          ? job.error_message ?? 'Export failed'
          : 'Export is still processing',
      );
    }

    const fileName = job.file_name ?? 'export.zip';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    if (this.storage.isEnabled()) {
      const stream = await this.storage.getDownloadStream(job.file_key);
      stream.pipe(res);
      return;
    }

    const fullPath = resolve(uploadRoot(), job.file_key);
    if (!existsSync(fullPath)) {
      throw new NotFoundException('Export file not found on disk');
    }
    createReadStream(fullPath).pipe(res);
  }

  private async loadExportJobRow(tenantId: string, jobId: string, requesterId: string) {
    const rows = await this.dataSource.query(
      `SELECT * FROM hr_document_export_jobs
       WHERE job_id = $1 AND tenant_id = $2 AND requested_by = $3`,
      [jobId, tenantId, requesterId],
    );
    const job = rows[0];
    if (!job) throw new NotFoundException('Export job not found');
    return job as {
      job_id: string;
      status: string;
      file_key: string | null;
      file_name: string | null;
      error_message: string | null;
      created_at: string;
      completed_at: string | null;
      filters: HrDocumentExportJob['filters'];
    };
  }

  async runExport(job: HrDocumentExportJob) {
    await this.dataSource.query(
      `UPDATE hr_document_export_jobs SET status = 'RUNNING' WHERE job_id = $1`,
      [job.jobId],
    );

    const label =
      job.filters.document_type === 'ALL'
        ? 'all documents'
        : `${job.filters.document_type.replace(/_/g, ' ')} cards`;

    try {
      const { sql, params } = this.buildDocumentFilterQuery(
        job.tenantId,
        job.entityId,
        job.filters,
        `d.document_id, d.file_url, d.file_name, d.document_type,
                u.name AS employee_name, p.employee_id`,
      );

      const docs = await this.dataSource.query<
        Array<{
          document_id: string;
          file_url: string;
          file_name: string | null;
          document_type: string;
          employee_name: string;
          employee_id: string | null;
        }>
      >(`${sql} ORDER BY u.name`, params);

      if (!docs.length) {
        throw new Error('No documents matched the selected filters');
      }

      const { zipBuffer, packedCount } = await this.buildZipArchive(docs);
      if (packedCount === 0) {
        throw new Error(
          'Matched documents exist but their files could not be read from storage. Check S3/MinIO or upload paths.',
        );
      }

      const deptLabel = job.filters.dept_id ? `Dept${job.filters.dept_id}` : 'All';
      const zipName = `${deptLabel}_${job.filters.document_type}_Export.zip`;
      const fileKey = `${job.tenantId}/exports/${job.jobId}/${zipName}`;

      if (this.storage.isEnabled()) {
        const s3Key = this.storage.buildKey(job.tenantId, `exports/${job.jobId}/${zipName}`);
        await this.storage.upload(job.tenantId, s3Key, zipBuffer, 'application/zip');
        await this.dataSource.query(
          `UPDATE hr_document_export_jobs
           SET status = 'COMPLETED', file_key = $2, file_name = $3, completed_at = NOW()
           WHERE job_id = $1`,
          [job.jobId, s3Key, zipName],
        );
      } else {
        const fullPath = resolve(uploadRoot(), fileKey);
        mkdirSync(dirname(fullPath), { recursive: true });
        writeFileSync(fullPath, zipBuffer);
        await this.dataSource.query(
          `UPDATE hr_document_export_jobs
           SET status = 'COMPLETED', file_key = $2, file_name = $3, completed_at = NOW()
           WHERE job_id = $1`,
          [job.jobId, fileKey, zipName],
        );
      }

      const downloadPath = `/hr/export-job/${job.jobId}`;
      this.notify.exportReady({
        tenantId: job.tenantId,
        userId: job.requestedBy,
        jobId: job.jobId,
        label,
        zipUrl: downloadPath,
        title: 'Bulk document export ready',
        message: `Your ZIP archive (${packedCount} files) is ready. Click to download.`,
        actionLink: downloadPath,
      });

      return { file_key: fileKey, file_name: zipName, document_count: packedCount };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.dataSource.query(
        `UPDATE hr_document_export_jobs SET status = 'FAILED', error_message = $2, completed_at = NOW()
         WHERE job_id = $1`,
        [job.jobId, message],
      );
      this.notify.exportFailed({
        tenantId: job.tenantId,
        userId: job.requestedBy,
        jobId: job.jobId,
        label,
        errorMessage: message,
        title: 'Bulk document export failed',
        message: `Export failed: ${message}`,
        actionLink: '/hr/directory',
      });
      throw err;
    }
  }

  private async buildZipArchive(
    docs: Array<{
      file_url: string;
      file_name: string | null;
      document_type: string;
      employee_name: string;
      employee_id: string | null;
    }>,
  ): Promise<{ zipBuffer: Buffer; packedCount: number }> {
    return new Promise((resolvePromise, reject) => {
      const archive = new ZipArchive({ zlib: { level: 5 } });
      const chunks: Buffer[] = [];
      let packedCount = 0;

      archive.on('data', (chunk: Buffer) => chunks.push(chunk));
      archive.on('error', reject);
      archive.on('end', () =>
        resolvePromise({ zipBuffer: Buffer.concat(chunks), packedCount }),
      );

      void (async () => {
        for (const doc of docs) {
          const stream = await openDocumentReadStream(doc.file_url, this.storage);
          if (!stream) continue;
          packedCount += 1;
          const safeName = doc.employee_name.replace(/[^a-zA-Z0-9]/g, '');
          const empId = (doc.employee_id ?? 'NA').replace(/[^a-zA-Z0-9]/g, '');
          const ext = (doc.file_name ?? 'file.pdf').includes('.')
            ? doc.file_name!.slice(doc.file_name!.lastIndexOf('.'))
            : '.pdf';
          const entryName = `${doc.document_type}_${safeName}_${empId}${ext}`;
          archive.append(stream as Readable, { name: entryName });
        }
        await archive.finalize();
      })().catch(reject);
    });
  }
}
