/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await -- Stateful Jest database mocks are intentionally dynamic */
import { ForbiddenException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { DofaEngineService } from '../dofa-engine/dofa-engine.service';
import { AcquisitionService } from './acquisition.service';
import type {
  AcquisitionActor,
  CreateAcquisitionInput,
} from './acquisition.types';

const actor: AcquisitionActor = {
  user_id: '10000000-0000-4000-8000-000000000001',
  tenant_id: 'a0000000-0000-4000-8000-000000000001',
  role: 'Faculty',
};

const draft: CreateAcquisitionInput = {
  intended_use_case: 'Teaching laboratory',
  required_by_date: '2099-01-01',
  priority: 'HIGH',
  funding_source_type: 'DEPARTMENT',
  funding_source_id: '20000000-0000-4000-8000-000000000001',
  currency: 'INR',
  lines: [
    {
      acquisition_layout: 'OFFLINE',
      product_name: 'Controller',
      category: 'Electronics',
      quantity: 1,
      unit: 'unit',
      intended_use: 'Robotics',
      estimated_unit_price: 1000,
      preferred_vendor_name: 'Supplier',
      vendor_contact: 'private@example.com',
      vendor_address: 'Private address',
      item_classification: 'ASSET',
    },
  ],
};

describe('AcquisitionService authorization and sensitive data', () => {
  const db = { query: jest.fn(), transaction: jest.fn() };
  const dofa = {};
  let service: AcquisitionService;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ACQUISITION_DATA_ENCRYPTION_KEY;
    service = new AcquisitionService(
      db as unknown as DataSource,
      dofa as DofaEngineService,
    );
  });

  it('denies draft creation without a scoped requester capability', async () => {
    db.query.mockResolvedValueOnce([]);
    await expect(service.createDraft(actor, draft)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('denies cross-scope object access before loading child records', async () => {
    db.query
      .mockResolvedValueOnce([
        {
          acquisition_id: 'acq-1',
          acquisition_version_id: 'version-1',
          acquisition_number: 'ACQ-2099-000001',
          requester_id: 'different-user',
          requesting_department_id: 99,
          intended_department_id: 99,
          status: 'DRAFT',
          estimated_total: 100,
          version_number: 1,
        },
      ])
      .mockResolvedValue([]);
    await expect(service.getVersion(actor, 'version-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(
      db.query.mock.calls.some(([sql]) =>
        String(sql).includes('FROM acq_lines'),
      ),
    ).toBe(false);
  });

  it('enforces maker-checker separation during vendor selection', async () => {
    db.query
      .mockResolvedValueOnce([{ scope_type: 'TENANT', scope_reference: null }])
      .mockResolvedValueOnce([
        {
          acquisition_id: 'acq-1',
          acquisition_version_id: 'version-1',
          acquisition_number: 'ACQ-2099-000001',
          requester_id: actor.user_id,
          status: 'VENDOR_REVIEW',
          estimated_total: 100,
          version_number: 1,
        },
      ]);
    await expect(
      service.selectVendors(actor, 'version-1', []),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SOD_VIOLATION' }),
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('encrypts vendor contact data before persistence and never stores plaintext', async () => {
    process.env.ACQUISITION_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
      'base64',
    );
    db.query.mockResolvedValueOnce([
      { scope_type: 'TENANT', scope_reference: null },
    ]);
    let lineParams: unknown[] = [];
    const manager = {
      query: jest
        .fn()
        .mockImplementation(async (sql: string, params?: unknown[]) => {
          if (sql.includes('MAX(NULLIF')) return [{ next_number: 1 }];
          if (sql.includes('INSERT INTO acq_requests'))
            return [{ acquisition_id: 'acq-1' }];
          if (sql.includes('INSERT INTO acq_request_versions'))
            return [{ acquisition_version_id: 'version-1' }];
          if (sql.includes('INSERT INTO acq_lines')) lineParams = params ?? [];
          if (sql.includes('SELECT event_hash')) return [];
          return [];
        }),
    };
    db.transaction.mockImplementation(async (callback) => callback(manager));
    await service.createDraft(actor, draft);

    expect(String(lineParams[24])).toMatch(/^enc:v1:/);
    expect(String(lineParams[25])).toMatch(/^enc:v1:/);
    expect(JSON.stringify(lineParams)).not.toContain('private@example.com');
    expect(JSON.stringify(lineParams)).not.toContain('Private address');
  });

  it('fails closed when sensitive contact data is supplied without an encryption key', async () => {
    db.query.mockResolvedValueOnce([
      { scope_type: 'TENANT', scope_reference: null },
    ]);
    const manager = {
      query: jest.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('MAX(NULLIF')) return [{ next_number: 1 }];
        if (sql.includes('INSERT INTO acq_requests'))
          return [{ acquisition_id: 'acq-1' }];
        if (sql.includes('INSERT INTO acq_request_versions'))
          return [{ acquisition_version_id: 'version-1' }];
        return [];
      }),
    };
    db.transaction.mockImplementation(async (callback) => callback(manager));
    await expect(service.createDraft(actor, draft)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'DATA_ENCRYPTION_KEY_REQUIRED',
      }),
    });
  });
});
