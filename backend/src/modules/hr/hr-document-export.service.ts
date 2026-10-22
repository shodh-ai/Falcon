import {
  BadRequestException,
  ForbiddenException,
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
    if (!Number.isSafeInteger(entityId) || entityId <= 0) {
      throw new BadRequestException('A valid HR entity scope is required for document export');
    }
    const departmentScope = await this.loadReportDepartmentScope(
      tenantId,
      requestedBy,
      entityId,
    );
    // Never trust a caller-supplied authorized_dept_ids value. Capture the
    // effective scope in both the persisted job and the queue payload.
    const requestedDepartment = filters.dept_id;
    if (
      requestedDepartment != null &&
      (!Number.isSafeInteger(requestedDepartment) || requestedDepartment <= 0)
    ) {
      throw new BadRequestException('A valid department is required for document export');
    }
    if (
      departmentScope !== null &&
      (departmentScope.length === 0 ||
        (requestedDepartment != null && !departmentScope.includes(requestedDepartment)))
    ) {
      throw new ForbiddenException('Document export is outside your REPORTS department scope');
    }
    const effectiveFilters: HrDocumentExportJob['filters'] = {
      document_type: filters.document_type,
      ...(requestedDepartment == null ? {} : { dept_id: requestedDepartment }),
      ...(filters.role_id == null ? {} : { role_id: filters.role_id }),
      authorized_dept_ids:
        requestedDepartment == null ? departmentScope : [requestedDepartment],
    };
    const documentCount = await this.countMatchingDocuments(
      tenantId,
      entityId,
      effectiveFilters,
    );
    if (documentCount === 0) {
      throw new BadRequestException(
        'No documents matched the selected filters. Upload documents to the employee vault first.',
      );
    }

    const rows = await this.dataSource.query(
      `INSERT INTO hr_document_export_jobs (tenant_id, entity_id, requested_by, filters, status)
       VALUES ($1, $2, $3, $4::jsonb, 'QUEUED')
       RETURNING job_id`,
      [tenantId, entityId, requestedBy, JSON.stringify(effectiveFilters)],
    );
    const jobId = rows[0].job_id as string;
    await this.exportQueue.add('export', {
      jobId,
      tenantId,
      entityId,
      requestedBy,
      filters: effectiveFilters,
    } satisfies HrDocumentExportJob);
    return {
      job_id: jobId,
      document_count: documentCount,
      message:
        'Export queued. You will receive a notification when the archive is ready.',
    };
  }

  private async loadReportDepartmentScope(
    tenantId: string,
    userId: string,
    entityId: number,
  ): Promise<number[] | null> {
    const rows = await this.dataSource.query<
      Array<{
        can_view: boolean;
        entity_scope: number[] | null;
        department_scope: number[] | null;
      }>
    >(
      `SELECT can_view, entity_scope, department_scope
       FROM hr_access_controls
       WHERE tenant_id = $1 AND user_id = $2 AND module_name = 'REPORTS'`,
      [tenantId, userId],
    );
    const access = rows[0];
    if (
      access &&
      (!access.can_view ||
        (access.entity_scope !== null &&
          !access.entity_scope.includes(entityId)))
    ) {
      throw new ForbiddenException('Document export is outside your REPORTS scope');
    }
    const scope = access?.department_scope ?? null;
    if (
      scope !== null &&
      (!Array.isArray(scope) ||
        !scope.every((id) => Number.isSafeInteger(id) && id > 0))
    ) {
      throw new ForbiddenException('Invalid REPORTS department scope');
    }
    return scope;
  }

  private effectiveDepartmentIds(
    filters: HrDocumentExportJob['filters'],
  ): number[] | null {
    if (filters.authorized_dept_ids !== undefined) {
      const ids = filters.authorized_dept_ids;
      if (ids === null) return null;
      if (
        !Array.isArray(ids) ||
        !ids.every((id) => Number.isSafeInteger(id) && id > 0)
      ) {
        throw new BadRequestException('Invalid export department snapshot');
      }
      return ids;
    }
    // Legacy jobs predate explicit department snapshots. A selected department
    // is bounded; an unfiltered archive may contain all departments.
    return filters.dept_id == null ? null : [filters.dept_id];
  }

  private assertJobWithinCurrentDepartmentScope(
    filters: HrDocumentExportJob['filters'],
    currentScope: number[] | null,
  ) {
    if (currentScope === null) return;
    const archivedDepartments = this.effectiveDepartmentIds(filters);
    if (
      archivedDepartments === null ||
      archivedDepartments.length === 0 ||
      !archivedDepartments.every((id) => currentScope.includes(id))
    ) {
      throw new NotFoundException('Export job not found or no longer accessible');
    }
  }

  private async countMatchingDocuments(
    tenantId: string,
    entityId: number,
    filters: HrDocumentExportJob['filters'],
  ): Promise<number> {
    const { sql, params } = this.buildDocumentFilterQuery(
      tenantId,
      entityId,
      filters,
      'COUNT(*)::int AS cnt',
    );
    const rows = await this.dataSource.query<Array<{ cnt: number }>>(
      sql,
      params,
    );
    return rows[0]?.cnt ?? 0;
  }

  private buildDocumentFilterQuery(
    tenantId: string,
    entityId: number,
    filters: HrDocumentExportJob['filters'],
    select: string,
  ) {
    if (!Number.isSafeInteger(entityId) || entityId <= 0) {
      throw new BadRequestException('A valid HR entity scope is required for document export');
    }
    const isAll = filters.document_type === 'ALL';
    const params: unknown[] = isAll
      ? [tenantId]
      : [tenantId, filters.document_type];
    let idx = isAll ? 2 : 3;
    let deptClause = '';
    let roleClause = '';
    let entityClause = '';
    const typeClause = isAll ? '' : ' AND d.document_type = $2';

    const effectiveDepartments = this.effectiveDepartmentIds(filters);
    if (effectiveDepartments !== null) {
      deptClause = ` AND u.dept_id = ANY($${idx}::int[])`;
      params.push(effectiveDepartments);
      idx++;
    }
    if (filters.role_id != null) {
      roleClause = ` AND u.role_id = $${idx}`;
      params.push(filters.role_id);
      idx++;
    }
    // Legacy documents have no entity_id. They belong only to the employee's
    // current profile/user entity, never to every entity in the tenant.
    entityClause = ` AND (d.entity_id = $${idx} OR (d.entity_id IS NULL AND COALESCE(p.entity_id, u.entity_id) = $${idx}))`;
    params.push(entityId);

    const sql = `SELECT ${select}
         FROM hr_employee_documents d
         JOIN users u ON u.user_id = d.user_id AND u.tenant_id = d.tenant_id
         LEFT JOIN hr_employee_profiles p ON p.user_id = d.user_id AND p.tenant_id = d.tenant_id
         WHERE d.tenant_id = $1${typeClause}${deptClause}${roleClause}${entityClause}`;
    return { sql, params };
  }

  async getExportJob(tenantId: string, jobId: string, requesterId: string) {
    const job = await this.loadExportJobRow(tenantId, jobId, requesterId);

    let download_url: string | null = null;
    if (job.status === 'COMPLETED' && job.file_key) {
      // Always use the authenticated route. A presigned object-store URL would
      // remain usable after the requester's HR access is revoked.
      download_url = `/api/hr/documents/export-jobs/${jobId}/download`;
    }

    return {
      job_id: job.job_id,
      status: job.status,
      file_name: job.file_name,
      error_message: job.error_message,
      skipped_count: job.status === 'COMPLETED'
        ? Number(job.error_message?.match(/^(\d+) of \d+ matched/)?.[1] ?? 0)
        : undefined,
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
          ? (job.error_message ?? 'Export failed')
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

  private async loadExportJobRow(
    tenantId: string,
    jobId: string,
    requesterId: string,
  ) {
    const rows = await this.dataSource.query(
      `SELECT j.*, ac.department_scope AS current_department_scope
       FROM hr_document_export_jobs j
       JOIN users u ON u.user_id = j.requested_by
         AND u.tenant_id = j.tenant_id AND u.is_active = true
       JOIN org_entities oe ON oe.entity_id = j.entity_id
         AND oe.tenant_id = j.tenant_id AND oe.is_active = true
       LEFT JOIN hr_access_controls ac ON ac.tenant_id = j.tenant_id
         AND ac.user_id = u.user_id AND ac.module_name = 'REPORTS'
       WHERE j.job_id = $1 AND j.tenant_id = $2 AND j.requested_by = $3
         AND (
           EXISTS (
             SELECT 1 FROM roles r
             WHERE r.role_id = u.role_id
               AND r.role_name IN ('HR', 'HRAdmin', 'SuperAdmin')
           )
           OR EXISTS (
             SELECT 1 FROM user_roles ur
             JOIN roles r ON r.role_id = ur.role_id
             WHERE ur.user_id = u.user_id
               AND r.role_name IN ('HR', 'HRAdmin', 'SuperAdmin')
           )
         )
         AND NOT EXISTS (
           SELECT 1 FROM hr_access_controls ac
           WHERE ac.tenant_id = j.tenant_id AND ac.user_id = u.user_id
             AND ac.module_name = 'REPORTS'
             AND (
               ac.can_view = false OR
               (ac.entity_scope IS NOT NULL AND NOT (j.entity_id = ANY(ac.entity_scope)))
             )
         )`,
      [jobId, tenantId, requesterId],
    );
    const job = rows[0];
    if (!job) throw new NotFoundException('Export job not found or no longer accessible');
    const currentDepartmentScope = job.current_department_scope as number[] | null;
    if (
      currentDepartmentScope !== null &&
      currentDepartmentScope !== undefined &&
      (!Array.isArray(currentDepartmentScope) ||
        !currentDepartmentScope.every(
          (id: number) => Number.isSafeInteger(id) && id > 0,
        ))
    ) {
      throw new NotFoundException('Export job not found or no longer accessible');
    }
    this.assertJobWithinCurrentDepartmentScope(
      job.filters as HrDocumentExportJob['filters'],
      currentDepartmentScope ?? null,
    );
    return job as {
      job_id: string;
      tenant_id: string;
      entity_id: number;
      requested_by: string;
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
      const persistedJob = await this.loadExportJobRow(
        job.tenantId,
        job.jobId,
        job.requestedBy,
      );
      if (
        persistedJob.tenant_id !== job.tenantId ||
        Number(persistedJob.entity_id) !== job.entityId ||
        persistedJob.requested_by !== job.requestedBy
      ) {
        throw new NotFoundException('Export job no longer matches its queued request');
      }
      const persistedFilters = persistedJob.filters;
      const { sql, params } = this.buildDocumentFilterQuery(
        job.tenantId,
        job.entityId,
        persistedFilters,
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

      const { zipBuffer, packedCount, skipped } = await this.buildZipArchive(
        docs,
        job.tenantId,
      );
      if (packedCount === 0) {
        throw new Error(
          `No matched files could be read from storage. ${skipped.length} document(s) unavailable: ${skipped
            .slice(0, 5)
            .map((item) => item.document_id)
            .join(', ')}${skipped.length > 5 ? ', …' : ''}. Check the source uploads or S3/MinIO object keys.`,
        );
      }

      const exportWarning = skipped.length
        ? `${skipped.length} of ${docs.length} matched document(s) were unavailable. Download the ZIP and inspect unavailable-documents.json for IDs and reasons.`
        : null;

      const deptLabel = persistedFilters.dept_id
        ? `Dept${persistedFilters.dept_id}`
        : 'All';
      const zipName = `${deptLabel}_${persistedFilters.document_type}_Export.zip`;
      const fileKey = `${job.tenantId}/exports/${job.jobId}/${zipName}`;

      if (this.storage.isEnabled()) {
        const s3Key = this.storage.buildKey(
          job.tenantId,
          `exports/${job.jobId}/${zipName}`,
        );
        await this.storage.upload(
          job.tenantId,
          s3Key,
          zipBuffer,
          'application/zip',
        );
        await this.dataSource.query(
          `UPDATE hr_document_export_jobs
           SET status = 'COMPLETED', file_key = $2, file_name = $3,
               error_message = $4, completed_at = NOW()
           WHERE job_id = $1`,
          [job.jobId, s3Key, zipName, exportWarning],
        );
      } else {
        const fullPath = resolve(uploadRoot(), fileKey);
        mkdirSync(dirname(fullPath), { recursive: true });
        writeFileSync(fullPath, zipBuffer);
        await this.dataSource.query(
          `UPDATE hr_document_export_jobs
           SET status = 'COMPLETED', file_key = $2, file_name = $3,
               error_message = $4, completed_at = NOW()
           WHERE job_id = $1`,
          [job.jobId, fileKey, zipName, exportWarning],
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
        message: `Your ZIP archive (${packedCount} files) is ready.${exportWarning ? ` ${exportWarning}` : ''}`,
        actionLink: downloadPath,
      });

      return {
        file_key: fileKey,
        file_name: zipName,
        document_count: packedCount,
        skipped_count: skipped.length,
      };
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
      document_id: string;
    }>,
    tenantId: string,
  ): Promise<{
    zipBuffer: Buffer;
    packedCount: number;
    skipped: Array<{ document_id: string; employee_name: string; document_type: string; reason: string }>;
  }> {
    return new Promise((resolvePromise, reject) => {
      const archive = new ZipArchive({ zlib: { level: 5 } });
      const chunks: Buffer[] = [];
      let packedCount = 0;
      const skipped: Array<{ document_id: string; employee_name: string; document_type: string; reason: string }> = [];

      archive.on('data', (chunk: Buffer) => chunks.push(chunk));
      archive.on('error', reject);
      archive.on('end', () =>
        resolvePromise({ zipBuffer: Buffer.concat(chunks), packedCount, skipped }),
      );

      void (async () => {
        for (const doc of docs) {
          let stream: Readable | null = null;
          let body: Buffer | null = null;
          try {
            stream = await openDocumentReadStream(
              doc.file_url,
              this.storage,
              tenantId,
            );
            // Read failures can occur after opening (permissions/network). Never
            // append a half-read source stream that would corrupt the whole ZIP.
            if (stream) {
              const parts: Buffer[] = [];
              let size = 0;
              for await (const part of stream) {
                const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
                size += chunk.length;
                if (size > 64 * 1024 * 1024) throw new Error('Document exceeds archive entry limit');
                parts.push(chunk);
              }
              if (size === 0) throw new Error('Empty document');
              body = Buffer.concat(parts);
            }
          } catch {
            // One missing S3 object must not prevent an otherwise valid export.
          } finally {
            stream?.destroy();
          }
          if (!body) {
            skipped.push({
              document_id: doc.document_id,
              employee_name: doc.employee_name,
              document_type: doc.document_type,
              reason: 'File missing, empty, unreadable, or exceeds the 64 MiB archive entry limit',
            });
            continue;
          }
          packedCount += 1;
          const safeName = doc.employee_name.replace(/[^a-zA-Z0-9]/g, '');
          const empId = (doc.employee_id ?? 'NA').replace(/[^a-zA-Z0-9]/g, '');
          const ext = doc.file_name?.match(/\.[a-zA-Z0-9]{1,10}$/)?.[0] ?? '.bin';
          const safeType = doc.document_type.replace(/[^a-zA-Z0-9_-]/g, '');
          const safeId = doc.document_id.replace(/[^a-zA-Z0-9-]/g, '');
          const entryName = `${safeType}_${safeName}_${empId}_${safeId}${ext}`;
          archive.append(body, { name: entryName });
        }
        if (skipped.length) {
          archive.append(
            JSON.stringify({ skipped_documents: skipped }, null, 2),
            { name: 'unavailable-documents.json' },
          );
        }
        await archive.finalize();
      })().catch(reject);
    });
  }
}
