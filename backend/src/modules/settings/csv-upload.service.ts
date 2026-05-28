import { BadRequestException, Injectable, Logger } from '@nestjs/common';

export interface CsvImportResult {
  total_rows: number;
  imported: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

export type CsvRowHandler = (row: Record<string, string>, rowIndex: number) => Promise<void> | void;

/**
 * Lightweight RFC-4180 CSV parser + row dispatcher. We avoid pulling in
 * `csv-parser` for the scaffold so this module ships zero new dependencies;
 * swap the body of `parse()` for the streaming `csv-parser` once installed
 * if the registrar starts uploading >100k-row exports.
 */
@Injectable()
export class CsvUploadService {
  private readonly logger = new Logger(CsvUploadService.name);

  parse(buffer: Buffer): Record<string, string>[] {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const rows: string[][] = [];
    let field = '';
    let row: string[] = [];
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"' && text[i + 1] === '"') {
          field += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          field += ch;
        }
        continue;
      }
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    if (rows.length === 0) return [];
    const header = rows[0].map((h) => h.trim());
    return rows.slice(1).filter((r) => r.some((c) => c.length > 0)).map((r) => {
      const obj: Record<string, string> = {};
      header.forEach((key, idx) => {
        obj[key] = (r[idx] ?? '').trim();
      });
      return obj;
    });
  }

  async processCsv(buffer: Buffer, handler: CsvRowHandler): Promise<CsvImportResult> {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('Empty CSV upload');
    }
    const rows = this.parse(buffer);
    const result: CsvImportResult = { total_rows: rows.length, imported: 0, skipped: 0, errors: [] };
    for (let i = 0; i < rows.length; i++) {
      try {
        await handler(rows[i], i + 2);
        result.imported++;
      } catch (err) {
        result.skipped++;
        const message = err instanceof Error ? err.message : 'Unknown error';
        result.errors.push({ row: i + 2, reason: message });
      }
    }
    this.logger.log(
      `CSV import finished: total=${result.total_rows} imported=${result.imported} skipped=${result.skipped}`,
    );
    return result;
  }
}
