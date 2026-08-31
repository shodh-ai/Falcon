/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await -- Jest transaction and Excel mocks are intentionally dynamic */
import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import type { DataSource } from 'typeorm';
import { AcquisitionImportService } from './acquisition-import.service';
import type { AcquisitionService } from './acquisition.service';
import type {
  AcquisitionActor,
  CreateAcquisitionInput,
} from './acquisition.types';

const actor: AcquisitionActor = {
  user_id: '10000000-0000-4000-8000-000000000001',
  tenant_id: 'a0000000-0000-4000-8000-000000000001',
};

const header: Omit<CreateAcquisitionInput, 'lines'> = {
  intended_use_case: 'Teaching laboratory',
  required_by_date: '2099-01-01',
  priority: 'NORMAL',
  funding_source_type: 'DEPARTMENT',
  funding_source_id: '20000000-0000-4000-8000-000000000001',
  currency: 'INR',
};

describe('AcquisitionImportService', () => {
  const db = { query: jest.fn(), transaction: jest.fn() };
  const acquisitions = { createDraft: jest.fn() };
  let service: AcquisitionImportService;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ACQUISITION_CLAMAV_COMMAND;
    delete process.env.ACQUISITION_REQUIRE_MALWARE_SCAN;
    process.env.NODE_ENV = 'test';
    service = new AcquisitionImportService(
      db as unknown as DataSource,
      acquisitions as unknown as AcquisitionService,
    );
  });

  async function workbookFile(mutator?: (workbook: ExcelJS.Workbook) => void) {
    const original = await service.template();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(original as unknown as ExcelJS.Buffer);
    mutator?.(workbook);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return {
      buffer,
      originalname: 'acquisition.xlsx',
      mimetype:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    } as Express.Multer.File;
  }

  it('creates a literal-value template that can be previewed', async () => {
    db.query.mockResolvedValueOnce([
      { import_preview_id: 'preview-1', expires_at: '2099-01-02T00:00:00Z' },
    ]);
    const result = await service.preview(actor, await workbookFile(), header);
    expect(result.validation.valid).toBe(true);
    expect(result.row_count).toBe(1);
    expect(result.malware_scan_status).toBe('SKIPPED');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO acq_import_previews'),
      expect.arrayContaining(['1.0', 'acquisition.xlsx', 'SKIPPED', 1]),
    );
  });

  it('rejects formula cells instead of trusting cached values', async () => {
    const file = await workbookFile((workbook) => {
      workbook.getWorksheet('Products')!.getCell('L2').value = {
        formula: '1+1',
        result: 2,
      };
    });
    await expect(service.preview(actor, file, header)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FORMULA_CELL_REJECTED' }),
    });
    expect(db.query).not.toHaveBeenCalled();
  });

  it('fails closed in production when malware scanning is unavailable', async () => {
    process.env.NODE_ENV = 'production';
    await expect(
      service.preview(actor, await workbookFile(), header),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'MALWARE_SCANNER_UNAVAILABLE',
      }),
    });
  });

  it('commits draft creation and token consumption in the same transaction', async () => {
    const manager = {
      query: jest
        .fn()
        .mockResolvedValueOnce([
          {
            parsed_payload: { ...header, lines: [] },
            validation_results: { valid: true },
            malware_scan_status: 'CLEAN',
            expires_at: '2099-01-01T00:00:00Z',
            consumed_at: null,
          },
        ])
        .mockResolvedValueOnce([]),
    };
    db.transaction.mockImplementation(async (callback) => callback(manager));
    acquisitions.createDraft.mockResolvedValue({
      acquisition_version_id: 'version-1',
    });

    await expect(service.commit(actor, 'preview-1')).resolves.toEqual({
      acquisition_version_id: 'version-1',
    });
    expect(acquisitions.createDraft).toHaveBeenCalledWith(
      actor,
      expect.any(Object),
      undefined,
      manager,
    );
    expect(manager.query).toHaveBeenLastCalledWith(
      expect.stringContaining('SET consumed_at=NOW()'),
      ['preview-1'],
    );
  });

  it('does not consume a preview when atomic draft creation fails', async () => {
    const manager = {
      query: jest.fn().mockResolvedValueOnce([
        {
          parsed_payload: { ...header, lines: [] },
          validation_results: { valid: true },
          malware_scan_status: 'CLEAN',
          expires_at: '2099-01-01T00:00:00Z',
          consumed_at: null,
        },
      ]),
    };
    db.transaction.mockImplementation(async (callback) => callback(manager));
    acquisitions.createDraft.mockRejectedValue(
      new BadRequestException('invalid row'),
    );

    await expect(service.commit(actor, 'preview-1')).rejects.toThrow(
      'invalid row',
    );
    expect(manager.query).toHaveBeenCalledTimes(1);
  });
});
