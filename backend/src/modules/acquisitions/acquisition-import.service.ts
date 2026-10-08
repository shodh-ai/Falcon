/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-base-to-string, @typescript-eslint/no-unnecessary-type-assertion -- ExcelJS models and TypeORM query() rows are untyped */
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
import { AcquisitionService } from './acquisition.service';
import type {
  AcquisitionActor,
  AcquisitionLineInput,
  CreateAcquisitionInput,
} from './acquisition.types';
import { sha256, validateAcquisition } from './acquisition.util';

const execFileAsync = promisify(execFile);
const TEMPLATE_VERSION = '1.0';

const HEADERS = [
  'Acquisition Layout',
  'Product Name',
  'Category',
  'Quantity',
  'Unit',
  'Brand',
  'Model Number',
  'Part Number',
  'Technical Specifications',
  'Product Description',
  'Intended Use',
  'Estimated Unit Price',
  'Delivery Cost',
  'Tax Cost',
  'Installation Cost',
  'Service Cost',
  'Miscellaneous Cost',
  'Preferred Vendor Name',
  'Product URL',
  'Vendor Contact',
  'Vendor Address',
  'Vendor Business Reference',
  'Return Policy',
  'Replacement Policy',
  'Warranty Requirements',
  'Expected Delivery Days',
  'Item Classification',
  'Expected Service Life Months',
  'Special Procurement Requirements',
  'Remarks',
] as const;

@Injectable()
export class AcquisitionImportService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly acquisitions: AcquisitionService,
  ) {}

  async template() {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Falcon Campus OS';
    workbook.created = new Date();
    const instructions = workbook.addWorksheet('Instructions');
    instructions.addRows([
      ['Falcon Digital Acquisition Template', `Version ${TEMPLATE_VERSION}`],
      [
        'Rules',
        'Use literal values only. Formulas, macros and external links are rejected.',
      ],
      ['Online', 'Product URL must be HTTPS.'],
      ['Offline', 'Preferred vendor name is recommended.'],
      ['Limits', 'Maximum 500 product rows and 5 MB.'],
      [
        'How to use',
        'Complete purpose, required date and funding in Falcon, then upload this workbook for product lines.',
      ],
      ['Quantity', 'Whole numbers only, for example 1, 25 or 500.'],
      [
        'Required columns',
        'Layout, Product, Category, Quantity, Unit, Technical Specifications, Intended Use, Estimated Unit Price and Item Classification.',
      ],
    ]);
    instructions.getColumn(1).width = 24;
    instructions.getColumn(2).width = 90;

    const sheet = workbook.addWorksheet('Products');
    sheet.addRow([...HEADERS]);
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF102A43' },
    };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    HEADERS.forEach((_header, index) => {
      sheet.getColumn(index + 1).width = index === 8 || index === 10 ? 36 : 22;
    });
    sheet.addRow([
      'ONLINE',
      'Example product',
      'Electronics',
      1,
      'unit',
      'Example Brand',
      'MODEL-1',
      'PART-1',
      'RAM: 16 GB; Storage: 512 GB',
      'Delete this example row before upload',
      'Teaching laboratory',
      1000,
      0,
      180,
      0,
      0,
      0,
      'Example Vendor',
      'https://example.com/product',
      '',
      '',
      '',
      '30 days',
      'Replacement within 7 days',
      '1 year',
      14,
      'ASSET',
      60,
      '',
      '',
    ]);
    for (let row = 2; row <= 501; row += 1) {
      sheet.getCell(`A${row}`).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: ['"GENERAL,ONLINE,OFFLINE"'],
      };
      sheet.getCell(`D${row}`).dataValidation = {
        type: 'whole',
        operator: 'between',
        allowBlank: false,
        formulae: [1, 1_000_000],
        showErrorMessage: true,
        errorTitle: 'Whole number required',
        error: 'Quantity must be a whole number from 1 to 1,000,000.',
      };
      sheet.getCell(`AA${row}`).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: ['"ASSET,CONSUMABLE,SERVICE"'],
      };
    }

    const definitions = workbook.addWorksheet('Field Definitions');
    definitions.addRows([
      ['Field', 'Required', 'Accepted format / meaning'],
      ['Layout', 'Yes', 'GENERAL, ONLINE or OFFLINE'],
      ['Product', 'Yes', 'Plain product or service name'],
      ['Category', 'Yes', 'Procurement category, for example Electronics'],
      ['Quantity', 'Yes', 'Whole number from 1 to 1,000,000'],
      ['Unit', 'Yes', 'For example unit, box or license'],
      [
        'Technical Specifications',
        'Yes',
        'Required technical characteristics; plain text',
      ],
      ['Intended Use', 'Yes', 'Why this line is needed'],
      [
        'Estimated Unit Price',
        'Yes',
        'Non-negative amount; Falcon recalculates totals',
      ],
      ['Preferred Vendor', 'Offline', 'Vendor name for an offline acquisition'],
      ['Product URL', 'Online', 'HTTPS URL for an online acquisition'],
      ['Item Classification', 'Yes', 'ASSET, CONSUMABLE or SERVICE'],
    ]);
    definitions.getRow(1).font = {
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    definitions.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF102A43' },
    };
    definitions.getColumn(1).width = 30;
    definitions.getColumn(2).width = 14;
    definitions.getColumn(3).width = 90;
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private async malwareScan(buffer: Buffer) {
    const command = process.env.ACQUISITION_CLAMAV_COMMAND?.trim();
    const required =
      process.env.ACQUISITION_REQUIRE_MALWARE_SCAN === 'true' ||
      process.env.NODE_ENV === 'production';
    if (!command) {
      if (required) {
        throw new BadRequestException({
          message: 'Malware scanner is required but unavailable',
          code: 'MALWARE_SCANNER_UNAVAILABLE',
        });
      }
      return 'SKIPPED' as const;
    }
    const dir = await mkdtemp(join(tmpdir(), 'falcon-acq-'));
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
    const value = cell.value as any;
    if (value && typeof value === 'object') {
      if ('formula' in value || 'sharedFormula' in value) {
        throw new BadRequestException({
          message: `Formula cells are forbidden (${column}, row ${row})`,
          code: 'FORMULA_CELL_REJECTED',
        });
      }
      if ('hyperlink' in value)
        return String(value.text ?? value.hyperlink ?? '').trim();
      if ('richText' in value)
        return value.richText
          .map((part: { text?: string }) => part.text ?? '')
          .join('')
          .trim();
      if (value instanceof Date) return value.toISOString().slice(0, 10);
    }
    return value ?? '';
  }

  private number(value: unknown) {
    if (value === '' || value == null) return 0;
    const number = Number(value);
    if (!Number.isFinite(number)) return Number.NaN;
    return number;
  }

  async preview(
    actor: AcquisitionActor,
    file: Express.Multer.File,
    header: Omit<CreateAcquisitionInput, 'lines'>,
  ) {
    if (!file?.buffer?.length)
      throw new BadRequestException('Workbook is required');
    if (file.buffer[0] !== 0x50 || file.buffer[1] !== 0x4b) {
      throw new BadRequestException('Workbook signature is invalid');
    }
    const scanStatus = await this.malwareScan(file.buffer);
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(file.buffer as unknown as ExcelJS.Buffer, {
        ignoreNodes: ['dataValidations'],
      });
    } catch {
      throw new BadRequestException('Workbook is corrupt or unsupported');
    }
    const model = workbook.model as any;
    if (model?.vbaProject || model?.externalLinks?.length) {
      throw new BadRequestException({
        message: 'Macros and external workbook links are forbidden',
        code: 'ACTIVE_CONTENT_REJECTED',
      });
    }
    const sheet = workbook.getWorksheet('Products');
    if (!sheet) throw new BadRequestException('Products worksheet is required');
    const actualHeaders = (sheet.getRow(1).values as unknown[])
      .slice(1)
      .map((value) => String(value ?? '').trim());
    if (
      actualHeaders.length !== HEADERS.length ||
      HEADERS.some((value, index) => actualHeaders[index] !== value)
    ) {
      throw new BadRequestException({
        message: `Template headers do not match version ${TEMPLATE_VERSION}`,
        code: 'TEMPLATE_VERSION_MISMATCH',
      });
    }
    const lines: AcquisitionLineInput[] = [];
    for (let rowNo = 2; rowNo <= sheet.rowCount; rowNo += 1) {
      const row = sheet.getRow(rowNo);
      if (!row.hasValues) continue;
      if (lines.length >= 500)
        throw new BadRequestException('Workbook exceeds 500 product rows');
      const values = HEADERS.map((name, index) =>
        this.literal(row.getCell(index + 1), rowNo, name),
      );
      lines.push({
        acquisition_layout: String(values[0])
          .trim()
          .toUpperCase() as AcquisitionLineInput['acquisition_layout'],
        product_name: String(values[1]).trim(),
        category: String(values[2]).trim(),
        quantity: this.number(values[3]),
        unit: String(values[4]).trim() || 'unit',
        brand: String(values[5]).trim() || undefined,
        model_number: String(values[6]).trim() || undefined,
        part_number: String(values[7]).trim() || undefined,
        technical_specifications: String(values[8]).trim(),
        product_description: String(values[9]).trim() || undefined,
        intended_use: String(values[10]).trim(),
        estimated_unit_price: this.number(values[11]),
        delivery_cost: this.number(values[12]),
        tax_cost: this.number(values[13]),
        installation_cost: this.number(values[14]),
        service_cost: this.number(values[15]),
        miscellaneous_cost: this.number(values[16]),
        preferred_vendor_name: String(values[17]).trim() || undefined,
        product_url: String(values[18]).trim() || undefined,
        vendor_contact: String(values[19]).trim() || undefined,
        vendor_address: String(values[20]).trim() || undefined,
        vendor_business_reference: String(values[21]).trim() || undefined,
        return_policy: String(values[22]).trim() || undefined,
        replacement_policy: String(values[23]).trim() || undefined,
        warranty_requirements: String(values[24]).trim() || undefined,
        expected_delivery_days:
          values[25] === '' ? undefined : this.number(values[25]),
        item_classification: String(values[26])
          .trim()
          .toUpperCase() as AcquisitionLineInput['item_classification'],
        expected_service_life_months:
          values[27] === '' ? undefined : this.number(values[27]),
        special_procurement_requirements:
          String(values[28]).trim() || undefined,
        remarks: String(values[29]).trim() || undefined,
      });
    }
    if (!lines.length)
      throw new BadRequestException('Workbook has no product rows');
    const payload = { ...header, lines } as CreateAcquisitionInput;
    const validation = validateAcquisition(payload);
    const tenantId = actor.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
    const rows = await this.db.query(
      `INSERT INTO acq_import_previews (
         tenant_id, requested_by, template_version, original_filename,
         content_hash, parsed_payload, validation_results, malware_scan_status,
         row_count, expires_at
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,NOW()+INTERVAL '24 hours')
       RETURNING import_preview_id, expires_at`,
      [
        tenantId,
        actor.user_id,
        TEMPLATE_VERSION,
        file.originalname,
        sha256(file.buffer.toString('base64')),
        JSON.stringify(payload),
        JSON.stringify(validation),
        scanStatus,
        lines.length,
      ],
    );
    return {
      import_preview_id: rows[0].import_preview_id,
      expires_at: rows[0].expires_at,
      row_count: lines.length,
      malware_scan_status: scanStatus,
      validation,
      payload,
    };
  }

  async commit(actor: AcquisitionActor, previewId: string) {
    return this.db.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT * FROM acq_import_previews
         WHERE import_preview_id=$1 AND tenant_id=$2 AND requested_by=$3 FOR UPDATE`,
        [
          previewId,
          actor.tenant_id ?? 'a0000000-0000-4000-8000-000000000001',
          actor.user_id,
        ],
      );
      const preview = rows[0];
      if (!preview) throw new NotFoundException('Import preview not found');
      if (preview.consumed_at)
        throw new ConflictException('Import preview was already consumed');
      if (new Date(preview.expires_at).getTime() <= Date.now())
        throw new ConflictException('Import preview expired');
      if (!preview.validation_results?.valid)
        throw new BadRequestException(
          'Import preview contains validation errors',
        );
      if (!['CLEAN', 'SKIPPED'].includes(preview.malware_scan_status))
        throw new BadRequestException('Import preview is not cleared');
      const acquisition = await this.acquisitions.createDraft(
        actor,
        preview.parsed_payload as CreateAcquisitionInput,
        undefined,
        manager,
      );
      await manager.query(
        `UPDATE acq_import_previews SET consumed_at=NOW() WHERE import_preview_id=$1`,
        [previewId],
      );
      return acquisition;
    });
  }
}
