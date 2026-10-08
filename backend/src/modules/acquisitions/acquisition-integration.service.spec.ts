/* eslint-disable @typescript-eslint/require-await -- Jest database mocks are intentionally dynamic */
import { ConflictException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { AcquisitionIntegrationService } from './acquisition-integration.service';
import type { AcquisitionService } from './acquisition.service';
import type { IrmsIdentity } from './irms-service-auth.guard';
import { sha256 } from './acquisition.util';

describe('AcquisitionIntegrationService idempotency', () => {
  const identity: IrmsIdentity = {
    integration_client_id: 'client-uuid',
    client_id: 'irms-client',
    tenant_id: 'tenant-uuid',
    scopes: ['acquisitions:create'],
  };
  const body = {
    requester_user_id: 'requester-uuid',
    external_reference: 'IRMS-1001',
    acquisition: {
      intended_use_case: 'Laboratory',
      required_by_date: '2099-01-01',
      funding_source_type: 'DEPARTMENT' as const,
      funding_source_id: 'fund-uuid',
      lines: [
        {
          acquisition_layout: 'GENERAL' as const,
          product_name: 'Device',
          category: 'Equipment',
          quantity: 1,
          intended_use: 'Teaching',
          estimated_unit_price: 100,
          item_classification: 'ASSET' as const,
        },
      ],
    },
  };
  const db = { query: jest.fn() };
  const acquisitions = {
    createDraft: jest.fn(),
    validate: jest.fn(),
    submit: jest.fn(),
    getVersion: jest.fn(),
  };
  let service: AcquisitionIntegrationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AcquisitionIntegrationService(
      db as unknown as DataSource,
      acquisitions as unknown as AcquisitionService,
    );
  });

  it('returns the original response for an identical completed key', async () => {
    const response = {
      acquisition_version_id: 'version-1',
      status: 'VENDOR_REVIEW',
    };
    db.query.mockResolvedValueOnce([
      { request_hash: sha256(body), response_payload: response },
    ]);
    await expect(
      service.create(identity, 'key-1', 'request-1', body),
    ).resolves.toEqual(response);
    expect(acquisitions.createDraft).not.toHaveBeenCalled();
  });

  it('returns 409 semantics when the same key carries a changed payload', async () => {
    db.query.mockResolvedValueOnce([
      { request_hash: 'different', response_payload: null },
    ]);
    await expect(
      service.create(identity, 'key-1', 'request-1', body),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a concurrent duplicate while the original request is processing', async () => {
    db.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { request_hash: sha256(body), response_payload: null },
      ]);
    await expect(
      service.create(identity, 'key-1', 'request-1', body),
    ).rejects.toThrow('already processing');
  });

  it('recovers a failed request without creating a duplicate acquisition', async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT * FROM acq_integration_idempotency')) {
        return [
          {
            idempotency_id: 'idem-1',
            request_hash: sha256(body),
            response_status: 500,
            response_payload: null,
          },
        ];
      }
      if (sql.includes('SET response_status=NULL'))
        return [{ idempotency_id: 'idem-1' }];
      if (sql.includes('FROM acq_requests r')) {
        return [
          {
            acquisition_id: 'acq-1',
            acquisition_number: 'ACQ-2099-000001',
            acquisition_version_id: 'version-1',
            version_number: 1,
            status: 'VENDOR_REVIEW',
          },
        ];
      }
      if (sql.includes('SET response_status=201')) return [];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    acquisitions.getVersion.mockResolvedValue({
      acquisition_version_id: 'version-1',
      status: 'VENDOR_REVIEW',
    });

    await expect(
      service.create(identity, 'key-1', 'request-1', body),
    ).resolves.toMatchObject({
      acquisition_version_id: 'version-1',
      status: 'VENDOR_REVIEW',
    });
    expect(acquisitions.createDraft).not.toHaveBeenCalled();
  });
});
