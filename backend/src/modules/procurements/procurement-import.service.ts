/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-base-to-string -- ExcelJS and query rows are untyped */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { execFile } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import type { ProcurementActor } from './procurement.types';
import { hash } from './procurement.util';
import { ProcurementService } from './procurement.service';

const execFileAsync = promisify(execFile);
const TEMPLATE_VERSION = '2.0';
const SHEETS = {
  Orders: {
    table: 'proc_orders',
    id: 'order_id',
    status: "status='DRAFT'",
    fields: [
      'external_order_id',
      'order_date',
      'expected_delivery_date',
      'product_url',
    ],
    updated: true,
  },
  Invoices: {
    table: 'proc_invoices',
    id: 'invoice_id',
    status: "status='ENTERED'",
    fields: ['invoice_date', 'document_object_key', 'document_hash'],
    updated: true,
  },
  Receipts: {
    table: 'proc_receipts',
    id: 'receipt_id',
    status: "status='ENTERED'",
    fields: ['actual_delivery_date', 'notes'],
    updated: false,
  },
  Adjustments: {
    table: 'proc_adjustments',
    id: 'adjustment_id',
    status: "status='ENTERED'",
    fields: ['reference_number'],
    updated: false,
  },
  Returns: {
    table: 'proc_returns',
    id: 'return_id',
    status: "status='REQUESTED'",
    fields: ['reason'],
    updated: true,
  },
} as const;
type SheetName = keyof typeof SHEETS;
type Change = {
  sheet: SheetName;
  id: string;
  values: Record<string, string | null>;
};

@Injectable()
export class ProcurementImportService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly procurements: ProcurementService,
  ) {}

  private async malwareScan(buffer: Buffer) {
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
      return 'SKIPPED' as const;
    }
    const dir = await mkdtemp(join(tmpdir(), 'falcon-proc-'));
    const file = join(dir, 'upload.xlsx');
    try {
      await writeFile(file, buffer, { flag: 'wx', mode: 0o600 });
      try {
        await execFileAsync(command, ['--no-summary', file], {
          timeout: 30_000,
          maxBuffer: 512 * 1024,
        });
      } catch {
        throw new BadRequestException({
          message: 'Workbook failed malware scanning',
          code: 'MALWARE_DETECTED',
        });
      }
      return 'CLEAN' as const;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private literal(cell: ExcelJS.Cell, row: number, column: string) {
    const raw = cell.value as any;
    if (raw && typeof raw === 'object') {
      if ('formula' in raw || 'sharedFormula' in raw)
        throw new BadRequestException({
          message: `Formula cells are forbidden (${column}, row ${row})`,
          code: 'FORMULA_CELL_REJECTED',
        });
      if ('hyperlink' in raw) return String(raw.text ?? '').trim();
      if ('richText' in raw)
        return raw.richText
          .map((part: { text?: string }) => part.text ?? '')
          .join('')
          .trim();
      if (raw instanceof Date) return raw.toISOString().slice(0, 10);
    }
    return raw == null ? '' : String(raw).trim();
  }

  async export(actor: ProcurementActor, caseId: string) {
    const detail = await this.procurements.get(actor, caseId);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Falcon Campus OS';
    workbook.created = new Date();
    const meta = workbook.addWorksheet('_Meta');
    meta.state = 'veryHidden';
    meta.addRows([
      ['Template Version', TEMPLATE_VERSION],
      ['Procurement Case ID', caseId],
      ['Aggregate Revision', detail.aggregate_revision],
      ['Exported At', new Date().toISOString()],
    ]);
    const add = (name: SheetName, rows: Array<Record<string, any>>) => {
      const config = SHEETS[name];
      const headers = ['Action', config.id, ...config.fields];
      const sheet = workbook.addWorksheet(name);
      sheet.addRow(headers);
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF102A43' },
      };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      headers.forEach(
        (_header, index) =>
          (sheet.getColumn(index + 1).width = index === 0 ? 14 : 28),
      );
      for (const row of rows)
        sheet.addRow([
          '',
          row[config.id],
          ...config.fields.map((field) => row[field] ?? ''),
        ]);
    };
    add('Orders', detail.orders);
    add('Invoices', detail.invoices);
    add('Receipts', detail.receipts);
    add('Adjustments', detail.adjustments);
    add('Returns', detail.returns);
    const instructions = workbook.addWorksheet('Instructions');
    instructions.addRows([
      [
        'Falcon Progressive Procurement Workbook',
        `Version ${TEMPLATE_VERSION}`,
      ],
      [
        'How to edit',
        'Set Action to UPDATE only for rows you changed. IDs and finalized records are immutable.',
      ],
      [
        'Security',
        'Formulas, macros, embedded active content, external workbook links, stale revisions, and unauthorized fields are rejected.',
      ],
      [
        'Creation',
        'Create new financial records in Falcon; the workbook performs safe progressive corrections to mutable records.',
      ],
    ]);
    instructions.getColumn(1).width = 24;
    instructions.getColumn(2).width = 100;
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async preview(
    actor: ProcurementActor,
    caseId: string,
    file: Express.Multer.File,
  ) {
    const access = await this.procurements.authorizeImport(actor, caseId);
    if (
      !file?.buffer?.length ||
      file.buffer[0] !== 0x50 ||
      file.buffer[1] !== 0x4b
    )
      throw new BadRequestException('Valid .xlsx workbook is required');
    const scan = await this.malwareScan(file.buffer);
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(file.buffer as unknown as ExcelJS.Buffer, {
        ignoreNodes: ['dataValidations'],
      });
    } catch {
      throw new BadRequestException('Workbook is corrupt or unsupported');
    }
    const model = workbook.model as any;
    if (model?.vbaProject || model?.externalLinks?.length)
      throw new BadRequestException({
        message: 'Macros and external workbook links are forbidden',
        code: 'ACTIVE_CONTENT_REJECTED',
      });
    workbook.eachSheet((sheet) =>
      sheet.eachRow((row, rowNo) =>
        row.eachCell((cell, column) => {
          this.literal(
            cell,
            rowNo,
            String(sheet.getRow(1).getCell(column).value ?? column),
          );
        }),
      ),
    );
    const meta = workbook.getWorksheet('_Meta');
    if (!meta)
      throw new BadRequestException('Protected workbook metadata is missing');
    const template = this.literal(meta.getCell('B1'), 1, 'Template Version');
    const workbookCase = this.literal(
      meta.getCell('B2'),
      2,
      'Procurement Case ID',
    );
    const revision = Number(
      this.literal(meta.getCell('B3'), 3, 'Aggregate Revision'),
    );
    if (template !== TEMPLATE_VERSION || workbookCase !== caseId)
      throw new BadRequestException({
        message: 'Workbook template or case identity is invalid',
        code: 'WORKBOOK_IDENTITY_MISMATCH',
      });
    if (revision !== Number(access.aggregate_revision))
      throw new ConflictException({
        message: 'Workbook is stale; export a current copy',
        code: 'STALE_WORKBOOK_REVISION',
        current_revision: Number(access.aggregate_revision),
      });
    const changes: Change[] = [];
    for (const name of Object.keys(SHEETS) as SheetName[]) {
      const sheet = workbook.getWorksheet(name);
      if (!sheet)
        throw new BadRequestException(`${name} worksheet is required`);
      const config = SHEETS[name];
      const expected = ['Action', config.id, ...config.fields];
      const actual = (sheet.getRow(1).values as unknown[]).slice(1).map(String);
      if (
        expected.some((header, index) => actual[index] !== header) ||
        actual.length !== expected.length
      )
        throw new BadRequestException({
          message: `${name} headers do not match template ${TEMPLATE_VERSION}`,
          code: 'TEMPLATE_VERSION_MISMATCH',
        });
      for (let rowNo = 2; rowNo <= sheet.rowCount; rowNo++) {
        const action = this.literal(
          sheet.getRow(rowNo).getCell(1),
          rowNo,
          'Action',
        ).toUpperCase();
        if (!action) continue;
        if (action !== 'UPDATE')
          throw new BadRequestException(`Unsupported ${name} action ${action}`);
        const id = this.literal(
          sheet.getRow(rowNo).getCell(2),
          rowNo,
          config.id,
        );
        if (!/^[0-9a-f-]{36}$/i.test(id))
          throw new BadRequestException(
            `Invalid ${config.id} at ${name} row ${rowNo}`,
          );
        const values: Record<string, string | null> = {};
        config.fields.forEach((field, index) => {
          const parsed = this.literal(
            sheet.getRow(rowNo).getCell(index + 3),
            rowNo,
            field,
          );
          values[field] = parsed || null;
        });
        changes.push({ sheet: name, id, values });
        if (changes.length > 500)
          throw new BadRequestException('Workbook exceeds 500 changed rows');
      }
    }
    if (!changes.length)
      throw new BadRequestException('Workbook contains no UPDATE actions');
    for (const change of changes) {
      const config = SHEETS[change.sheet];
      const targets = await this.db.query(
        `SELECT ${config.id} FROM ${config.table} WHERE ${config.id}=$1 AND proc_case_id=$2 AND tenant_id=$3 AND ${config.status}`,
        [change.id, caseId, access.tenant_id],
      );
      if (!targets[0])
        throw new ConflictException({
          message: `${change.sheet} record is finalized, unauthorized, or missing`,
          code: 'IMMUTABLE_WORKBOOK_RECORD',
          id: change.id,
        });
      if (
        change.values.document_object_key &&
        !change.values.document_object_key.startsWith(`${access.tenant_id}/`)
      )
        throw new BadRequestException(
          'Invoice document object key is outside tenant scope',
        );
    }
    const previews = await this.db.query(
      `INSERT INTO proc_import_previews (proc_case_id,tenant_id,requested_by,base_revision,original_filename,content_hash,parsed_changes,validation_results,malware_scan_status,changed_rows,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,NOW()+INTERVAL '24 hours') RETURNING import_preview_id,changed_rows,expires_at`,
      [
        caseId,
        access.tenant_id,
        actor.user_id,
        revision,
        file.originalname,
        hash(file.buffer.toString('base64')),
        JSON.stringify(changes),
        JSON.stringify({ valid: true, errors: [], warnings: [] }),
        scan,
        changes.length,
      ],
    );
    return {
      ...previews[0],
      base_revision: revision,
      malware_scan_status: scan,
      diff: changes,
      validation: { valid: true, errors: [], warnings: [] },
    };
  }

  async commit(actor: ProcurementActor, caseId: string, previewId: string) {
    const access = await this.procurements.authorizeImport(actor, caseId);
    return this.db.transaction(async (manager) => {
      const previews = await manager.query(
        `SELECT * FROM proc_import_previews WHERE import_preview_id=$1 AND proc_case_id=$2 AND tenant_id=$3 AND requested_by=$4 FOR UPDATE`,
        [previewId, caseId, access.tenant_id, actor.user_id],
      );
      const preview = previews[0];
      if (!preview) throw new NotFoundException('Import preview not found');
      if (preview.consumed_at)
        throw new ConflictException('Import preview was already consumed');
      if (new Date(preview.expires_at).getTime() <= Date.now())
        throw new ConflictException('Import preview expired');
      const cases = await manager.query(
        `SELECT * FROM proc_cases WHERE proc_case_id=$1 AND tenant_id=$2 FOR UPDATE`,
        [caseId, access.tenant_id],
      );
      if (Number(cases[0].aggregate_revision) !== Number(preview.base_revision))
        throw new ConflictException({
          message: 'Procurement case changed after preview',
          code: 'STALE_WORKBOOK_REVISION',
          current_revision: Number(cases[0].aggregate_revision),
        });
      for (const change of preview.parsed_changes as Change[]) {
        const config = SHEETS[change.sheet];
        const assignments = config.fields
          .map((field, index) => `${field}=$${index + 4}`)
          .join(',');
        const result = await manager.query(
          `UPDATE ${config.table} SET ${assignments}${config.updated ? ',updated_at=NOW()' : ''} WHERE ${config.id}=$1 AND proc_case_id=$2 AND tenant_id=$3 AND ${config.status} RETURNING ${config.id}`,
          [
            change.id,
            caseId,
            access.tenant_id,
            ...config.fields.map((field) => change.values[field]),
          ],
        );
        if (!result[0])
          throw new ConflictException({
            message: 'Atomic import target changed or finalized',
            code: 'IMPORT_ATOMIC_CONFLICT',
            id: change.id,
          });
      }
      await manager.query(
        `UPDATE proc_cases SET aggregate_revision=aggregate_revision+1,updated_at=NOW(),last_activity_at=NOW() WHERE proc_case_id=$1`,
        [caseId],
      );
      await manager.query(
        `UPDATE proc_import_previews SET consumed_at=NOW() WHERE import_preview_id=$1`,
        [previewId],
      );
      return {
        import_preview_id: previewId,
        committed_rows: Number(preview.changed_rows),
        aggregate_revision: Number(preview.base_revision) + 1,
      };
    });
  }
}
