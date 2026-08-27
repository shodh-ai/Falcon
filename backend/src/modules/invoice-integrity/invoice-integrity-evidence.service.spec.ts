import { BadRequestException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { ObjectStorageService } from '../../storage/object-storage.service';
import { InvoiceIntegrityEvidenceService } from './invoice-integrity-evidence.service';

describe('Module 3 evidence boundary', () => {
  it('rejects spoofed PDF evidence before storage', async () => {
    const storage = { upload: jest.fn(), buildKey: jest.fn() };
    const integrity = { authorizeView: jest.fn() };
    const service = new InvoiceIntegrityEvidenceService(
      { query: jest.fn() } as unknown as DataSource,
      storage as unknown as ObjectStorageService,
      integrity as never,
    );
    await expect(
      service.upload(
        {
          user_id: '10000000-0000-4000-8000-000000000001',
          tenant_id: '20000000-0000-4000-8000-000000000001',
        },
        '30000000-0000-4000-8000-000000000001',
        'SUPPORTING_DOCUMENT',
        {
          originalname: 'evidence.pdf',
          mimetype: 'application/pdf',
          buffer: Buffer.from('spoofed'),
          size: 7,
        } as Express.Multer.File,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.upload).not.toHaveBeenCalled();
  });
});
