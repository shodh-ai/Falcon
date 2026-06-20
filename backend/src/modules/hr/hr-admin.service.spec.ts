import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { HrAdminService } from './hr-admin.service';
import { HrFieldEncryptionService } from '../../common/crypto/hr-field-encryption.service';
import { HrEntityContextService } from './hr-entity-context.service';
import { HrChecklistService } from './hr-checklist.service';
import { HrOnboardingWorkflowService } from './hr-onboarding-workflow.service';
import { CacheService } from '../../core/redis/cache.service';

describe('HrAdminService biometric sync', () => {
  let service: HrAdminService;
  let config: { get: jest.Mock };

  beforeEach(async () => {
    config = {
      get: jest.fn((key: string) => {
        if (key === 'HR_BIOMETRIC_API_KEY') return 'sgvu_bio_sync_9982';
        if (key === 'HR_BIOMETRIC_TENANT_ID') {
          return 'a0000000-0000-4000-8000-000000000001';
        }
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HrAdminService,
        { provide: DataSource, useValue: { query: jest.fn() } },
        { provide: HrFieldEncryptionService, useValue: {} },
        { provide: ConfigService, useValue: config },
        { provide: HrEntityContextService, useValue: {} },
        { provide: HrChecklistService, useValue: {} },
        { provide: HrOnboardingWorkflowService, useValue: {} },
        { provide: CacheService, useValue: {} },
      ],
    }).compile();

    service = module.get(HrAdminService);
  });

  describe('validateBiometricApiKey', () => {
    it('accepts a matching API key', () => {
      expect(() =>
        service.validateBiometricApiKey('sgvu_bio_sync_9982'),
      ).not.toThrow();
    });

    it('rejects a missing API key', () => {
      expect(() => service.validateBiometricApiKey(undefined)).toThrow(
        ForbiddenException,
      );
    });

    it('rejects a mismatched API key', () => {
      expect(() => service.validateBiometricApiKey('wrong-key')).toThrow(
        ForbiddenException,
      );
    });

    it('rejects when server key is not configured', () => {
      config.get.mockReturnValue(undefined);
      expect(() => service.validateBiometricApiKey('any-key')).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('normalizeBiometricPunches', () => {
    it('normalizes a single punch payload', () => {
      expect(
        service.normalizeBiometricPunches({
          employee_id: ' EMP-001 ',
          punch_time: '2026-06-20T09:05:00Z',
          device_id: ' MAIN_GATE_1 ',
        }),
      ).toEqual([
        {
          employee_id: 'EMP-001',
          punch_time: '2026-06-20T09:05:00Z',
          device_id: 'MAIN_GATE_1',
          punch_type: 'IN',
          entity_id: undefined,
        },
      ]);
    });

    it('normalizes legacy emp_id/timestamp payload', () => {
      expect(
        service.normalizeBiometricPunches({
          emp_id: 'EMP-002',
          timestamp: '2026-06-20T17:02:00Z',
          device_id: 'GATE-2',
          punch_type: 'OUT',
        }),
      ).toEqual([
        {
          employee_id: 'EMP-002',
          punch_time: '2026-06-20T17:02:00Z',
          device_id: 'GATE-2',
          punch_type: 'OUT',
          entity_id: undefined,
        },
      ]);
    });

    it('normalizes batch punches and defaults punch_type to IN', () => {
      expect(
        service.normalizeBiometricPunches({
          punches: [
            {
              employee_id: 'EMP-003',
              punch_time: '2026-06-20T09:05:00Z',
            },
          ],
        }),
      ).toEqual([
        {
          employee_id: 'EMP-003',
          punch_time: '2026-06-20T09:05:00Z',
          device_id: undefined,
          punch_type: 'IN',
          entity_id: undefined,
        },
      ]);
    });
  });
});
