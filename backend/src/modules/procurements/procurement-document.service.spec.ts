import { BadRequestException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { ObjectStorageService } from '../../storage/object-storage.service';
import { ProcurementDocumentService } from './procurement-document.service';

const actor = {
  user_id: '10000000-0000-4000-8000-000000000001',
  tenant_id: '20000000-0000-4000-8000-000000000001',
  role: 'APClerk',
};
const caseId = '30000000-0000-4000-8000-000000000001';

describe('Module 2 invoice document boundary', () => {
  it('rejects spoofed MIME content before object storage', async () => {
    const storage = { upload: jest.fn(), buildKey: jest.fn() };
    const procurements = {
      authorizeInvoiceEntry: jest
        .fn()
        .mockResolvedValue({ tenant_id: actor.tenant_id }),
    };
    const service = new ProcurementDocumentService(
      { query: jest.fn() } as unknown as DataSource,
      storage as unknown as ObjectStorageService,
      procurements as never,
    );
    await expect(
      service.upload(actor, caseId, {
        originalname: 'invoice.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('not a PDF'),
        size: 9,
      } as Express.Multer.File),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('creates a tenant-prefixed clean upload token for valid literal evidence', async () => {
    const objectKey = `${actor.tenant_id}/2026/08/procurements/${caseId}/invoices/doc.pdf`;
    const storage = {
      buildKey: jest.fn().mockReturnValue(objectKey),
      upload: jest.fn().mockResolvedValue({ key: objectKey }),
    };
    const query = jest.fn().mockResolvedValue([
      {
        document_upload_id: '40000000-0000-4000-8000-000000000001',
        object_key: objectKey,
        malware_scan_status: 'CLEAN',
      },
    ]);
    const procurements = {
      authorizeInvoiceEntry: jest
        .fn()
        .mockResolvedValue({ tenant_id: actor.tenant_id }),
    };
    const service = new ProcurementDocumentService(
      { query } as unknown as DataSource,
      storage as unknown as ObjectStorageService,
      procurements as never,
    );
    const result = await service.upload(actor, caseId, {
      originalname: 'invoice.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7\ninvoice'),
      size: 16,
    } as Express.Multer.File);
    expect(storage.upload).toHaveBeenCalledWith(
      actor.tenant_id,
      objectKey,
      expect.any(Buffer),
      'application/pdf',
    );
    expect(result).toMatchObject({ malware_scan_status: 'CLEAN' });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('proc_document_uploads'),
      expect.any(Array),
    );
  });
});
