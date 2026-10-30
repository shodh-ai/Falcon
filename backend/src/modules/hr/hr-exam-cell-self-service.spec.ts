jest.mock('archiver', () => ({ ZipArchive: class {} }));

import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { EntityScopeGuard } from '../../common/guards/entity-scope.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { HrController } from './hr.controller';
import { HrDocumentVaultService } from './hr-document-vault.service';
import { HrService } from './hr.service';
import { EXAM_CELL_SELF_SERVICE_ROLES } from './hr-workforce.constants';

const tenantId = '10000000-0000-4000-8000-000000000001';
const userId = '20000000-0000-4000-8000-000000000001';
const otherUserId = '20000000-0000-4000-8000-000000000002';

const personalHandlers = [
  'myLeaveBalances',
  'attendanceCalendar',
  'essCalendar',
  'myPayslips',
  'myPayslipDownloadRequests',
  'requestPayslipDownload',
  'downloadApprovedPayslipRequest',
  'essDocuments',
  'uploadEssDocument',
  'downloadDocument',
  'streamDocumentFile',
  'workforceToday',
  'workforceApply',
  'workforceMyRequests',
] as const satisfies ReadonlyArray<keyof HrController>;

function permits(role: string, method: keyof HrController): boolean {
  // Read the original function for decorator metadata; never invoke it unbound.
  const handler = Reflect.get(HrController.prototype, method) as (
    ...args: never[]
  ) => unknown;
  const context = {
    getHandler: () => handler,
    getClass: () => HrController,
    switchToHttp: () => ({
      getRequest: () => ({
        user: { user_id: userId, tenant_id: tenantId, roles: [role] },
      }),
    }),
  } as unknown as ExecutionContext;
  return new RolesGuard(new Reflector()).canActivate(context);
}

function makeController(dependencies: Record<string, unknown>) {
  const controller = Object.create(HrController.prototype) as HrController;
  Object.assign(controller, dependencies);
  return controller;
}

describe('Examination Cell employee self-service access', () => {
  it.each(EXAM_CELL_SELF_SERVICE_ROLES)(
    'allows %s to use personal HR records',
    (role) => {
      for (const handler of personalHandlers)
        expect(permits(role, handler)).toBe(true);
    },
  );

  it.each(['Student', 'Parent'])(
    'continues denying %s employee self-service',
    (role) => {
      for (const handler of personalHandlers)
        expect(permits(role, handler)).toBe(false);
    },
  );

  it.each(EXAM_CELL_SELF_SERVICE_ROLES)(
    'does not grant %s HR administrative access',
    (role) => {
      for (const handler of [
        'attendanceMatrix',
        'runPayroll',
        'salaryStructures',
        'listPayrollPayslips',
        'publishPayslip',
        'pendingPayslipDownloadRequests',
        'actOnPayslipDownloadRequest',
        'listEmployeeDocuments',
        'uploadEmployeeDocument',
        'verifyDocument',
      ] as const)
        expect(permits(role, handler)).toBe(false);
    },
  );

  it.each(['DeputyCOE', 'ExamAdmin', 'ExamOperator'])(
    'does not grant %s new team approval access',
    (role) => {
      expect(permits(role, 'workforceTeamPending')).toBe(false);
      expect(permits(role, 'workforceTeamAction')).toBe(false);
    },
  );

  it('retains authentication and entity guards for document and calendar endpoints', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      HrController,
    ) as unknown[];
    expect(guards).toEqual(
      expect.arrayContaining([JwtAuthGuard, RolesGuard, EntityScopeGuard]),
    );
  });

  it('ignores an employee ID supplied by examination staff when submitting leave', async () => {
    const applyRequest = jest
      .fn()
      .mockResolvedValue({ leave_id: 'own-request' });
    const controller = makeController({ workforce: { applyRequest } });
    const body = {
      request_type: 'LEAVE' as const,
      staff_user_id: otherUserId,
      leave_type: 'CL',
    };

    await controller.workforceApply(
      { user: { user_id: userId, tenant_id: tenantId, roles: ['ExamCell'] } },
      body,
    );

    expect(applyRequest).toHaveBeenCalledWith(userId, tenantId, body, {
      actorRoles: ['ExamCell'],
    });
  });

  it('binds document uploads and listing to the authenticated tenant, employee and allowed entity', async () => {
    const listDocuments = jest.fn().mockResolvedValue({ documents: [] });
    const uploadDocument = jest
      .fn()
      .mockResolvedValue({ document_id: 'own-doc' });
    const resolveEntityId = jest.fn().mockResolvedValue(7);
    const controller = makeController({
      documentVault: { listDocuments, uploadDocument },
      entityCtx: { resolveEntityId },
    });
    const req = {
      user: { user_id: userId, tenant_id: tenantId, roles: ['ExamAdmin'] },
    };
    const body = {
      document_type: 'PAN',
      file_url: '/uploads/synthetic/file.pdf',
    };

    await controller.essDocuments(req, '7');
    await controller.uploadEssDocument(req, '7', body);

    expect(resolveEntityId).toHaveBeenCalledWith(tenantId, '7');
    expect(listDocuments).toHaveBeenCalledWith(tenantId, userId, 7);
    expect(uploadDocument).toHaveBeenCalledWith(
      tenantId,
      7,
      userId,
      userId,
      body,
      { autoVerify: false, requireUploaderOwnership: true },
    );
  });

  it('does not call document services if entity resolution refuses access', async () => {
    const listDocuments = jest.fn();
    const controller = makeController({
      documentVault: { listDocuments },
      entityCtx: {
        resolveEntityId: jest
          .fn()
          .mockRejectedValue(new ForbiddenException('Entity scope required')),
      },
    });

    await expect(
      controller.essDocuments({
        user: { user_id: userId, tenant_id: tenantId, roles: ['ExamCell'] },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(listDocuments).not.toHaveBeenCalled();
  });

  it.each(EXAM_CELL_SELF_SERVICE_ROLES)(
    'treats %s as the document owner, never an HR reviewer',
    async (role) => {
      const getSecureDownloadUrl = jest
        .fn()
        .mockResolvedValue({ url: '/own-file' });
      const pipeDocumentFile = jest.fn().mockResolvedValue(undefined);
      const controller = makeController({
        documentVault: { getSecureDownloadUrl, pipeDocumentFile },
      });
      const req = {
        user: { user_id: userId, tenant_id: tenantId, roles: [role] },
      };
      const response = {};

      await controller.downloadDocument('doc-id', req);
      await controller.streamDocumentFile('doc-id', req, response as never);

      expect(getSecureDownloadUrl).toHaveBeenCalledWith(
        tenantId,
        'doc-id',
        userId,
        false,
      );
      expect(pipeDocumentFile).toHaveBeenCalledWith(
        tenantId,
        'doc-id',
        userId,
        false,
        response,
      );
    },
  );
});

describe('personal HR download ownership boundaries', () => {
  it('rejects another employee document before accessing storage', async () => {
    const query = jest
      .fn()
      .mockResolvedValue([
        { user_id: otherUserId, file_url: 's3://synthetic/tenant-a/file.pdf' },
      ]);
    const getPresignedDownloadUrl = jest.fn();
    const getDownloadStream = jest.fn();
    const service = new HrDocumentVaultService(
      { query } as never,
      { getPresignedDownloadUrl, getDownloadStream } as never,
    );

    await expect(
      service.getSecureDownloadUrl(tenantId, 'foreign-doc', userId, false),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.pipeDocumentFile(
        tenantId,
        'foreign-doc',
        userId,
        false,
        {} as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id = $2'),
      ['foreign-doc', tenantId],
    );
    expect(getPresignedDownloadUrl).not.toHaveBeenCalled();
    expect(getDownloadStream).not.toHaveBeenCalled();
  });

  it('looks up payslip download requests by authenticated employee and tenant and requires HR approval', async () => {
    const findOne = jest.fn().mockResolvedValue({ status: 'PENDING' });
    const service = Object.create(HrService.prototype) as HrService;
    Object.assign(service, { payslipDownloadRequests: { findOne } });

    await expect(
      service.downloadApprovedPayslipRequest('request-id', userId, tenantId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findOne).toHaveBeenCalledWith({
      where: {
        request_id: 'request-id',
        staff_user_id: userId,
        tenant_id: tenantId,
      },
    });
  });
});
