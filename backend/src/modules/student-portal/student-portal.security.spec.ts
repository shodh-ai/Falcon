import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../common/guards/roles.guard';
import { requireTenantId } from '../../common/utils/require-tenant-id';
import { PlacementController } from '../placement/placement.controller';
import { PlacementService } from '../placement/placement.service';
import {
  LibraryAdminController,
  LibraryController,
} from '../library/library.controller';
import { StudentPortalController } from './student-portal.controller';
import { StudentPortalService } from './student-portal.service';

jest.mock('uuid', () => ({ v4: jest.fn(() => 'id') }));

const tenantId = 'tenant-a';
const studentId = 'student-a';
const student = { user_id: studentId, tenant_id: tenantId, role: 'Student' };

describe('student API security boundaries', () => {
  it.each(['Student', 'PlacementCell', 'SuperAdmin'])(
    'scopes mock-interview reads for %s',
    (role) => {
      const placement = { mockInterviews: jest.fn() };
      const controller = new PlacementController(placement as never);
      controller.mockInterviews({ user: { ...student, role } });
      expect(placement.mockInterviews).toHaveBeenCalledWith(
        tenantId,
        role === 'Student' ? studentId : undefined,
      );
    },
  );
  it.each([undefined, null, '', '  '])(
    'rejects missing tenant context %p',
    (value) => {
      expect(() => requireTenantId(value)).toThrow(ForbiddenException);
    },
  );

  it('rejects a student generating another student resume before any service call', () => {
    const placement = { generateResumePdf: jest.fn() };
    const controller = new PlacementController(placement as never);
    expect(() =>
      controller.generateResume({ user: student }, 'student-b'),
    ).toThrow(ForbiddenException);
    expect(placement.generateResumePdf).not.toHaveBeenCalled();
  });

  it.each(['Student', 'PlacementCell', 'SuperAdmin', 'CampusAdmin'])(
    'preserves authorized resume generation for %s',
    (role) => {
      const placement = {
        generateResumePdf: jest.fn().mockReturnValue('resume'),
      };
      const controller = new PlacementController(placement as never);
      const target = role === 'Student' ? studentId : 'student-b';
      expect(
        controller.generateResume({ user: { ...student, role } }, target),
      ).toBe('resume');
      expect(placement.generateResumePdf).toHaveBeenCalledWith(
        tenantId,
        target,
      );
    },
  );

  it.each(['Student', 'Faculty'])(
    'binds both library gate actions to the authenticated %s',
    async (role) => {
      const library = {
        resolveUserByBarcode: jest.fn(),
        gateCheckIn: jest.fn().mockResolvedValue('in'),
        gateCheckOut: jest.fn().mockResolvedValue('out'),
      };
      const controller = new LibraryAdminController(library as never);
      const req = { user: { ...student, role } };
      await controller.gateIn(req, {
        user_id: 'student-b',
        barcode: 'other-barcode',
      });
      await controller.gateOut(req, {
        user_id: 'student-b',
        barcode: 'other-barcode',
      });
      expect(library.resolveUserByBarcode).not.toHaveBeenCalled();
      expect(library.gateCheckIn).toHaveBeenCalledWith(tenantId, studentId);
      expect(library.gateCheckOut).toHaveBeenCalledWith(tenantId, studentId);
    },
  );

  it.each(['Librarian', 'SuperAdmin'])(
    'preserves tenant-scoped patron lookup for %s',
    async (role) => {
      const library = {
        resolveUserByBarcode: jest
          .fn()
          .mockResolvedValue({ user_id: 'student-b' }),
        gateCheckIn: jest.fn(),
      };
      const controller = new LibraryAdminController(library as never);
      await controller.gateIn(
        { user: { ...student, role } },
        { user_id: 'student-b' },
      );
      expect(library.resolveUserByBarcode).toHaveBeenCalledWith(
        tenantId,
        'student-b',
      );
      expect(library.gateCheckIn).toHaveBeenCalledWith(tenantId, 'student-b');
    },
  );

  it('does not create a gate entry when a staff patron lookup belongs to another tenant', async () => {
    const library = {
      resolveUserByBarcode: jest
        .fn()
        .mockRejectedValue(new NotFoundException()),
      gateCheckIn: jest.fn(),
    };
    const controller = new LibraryAdminController(library as never);
    await expect(
      controller.gateIn(
        { user: { ...student, role: 'Librarian' } },
        { user_id: 'other-tenant-student' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(library.gateCheckIn).not.toHaveBeenCalled();
  });

  it('rejects library calls without tenant context before accessing any account', () => {
    const library = { getMyAccount: jest.fn() };
    const controller = new LibraryController(library as never);
    expect(() =>
      controller.myAccount({ user: { ...student, tenant_id: undefined } }),
    ).toThrow(ForbiddenException);
    expect(library.getMyAccount).not.toHaveBeenCalled();
  });

  function permitted(method: keyof StudentPortalController, roles: string[]) {
    const guard = new RolesGuard(new Reflector());
    return guard.canActivate({
      getHandler: () => StudentPortalController.prototype[method],
      getClass: () => StudentPortalController,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    } as unknown as ExecutionContext);
  }

  it.each([
    'dashboard',
    'portalBootstrap',
    'attendance',
    'marks',
    'finance',
    'placements',
    'library',
    'exit',
  ] as const)(
    'denies applicant access to %s while preserving student access',
    (method) => {
      expect(permitted(method, ['Applicant'])).toBe(false);
      expect(permitted(method, ['Student'])).toBe(true);
      expect(permitted(method, ['Student', 'Applicant'])).toBe(true);
    },
  );

  it.each([
    'profile',
    'updateProfile',
    'getProfilePhoto',
    'uploadProfilePhoto',
    'documents',
    'admissionVault',
    'uploadAdmissionDocument',
    'profileUpdateRequest',
    'campusSettings',
  ] as const)(
    'preserves applicant admission/profile access to %s',
    (method) => {
      expect(permitted(method, ['Applicant'])).toBe(true);
    },
  );
});

describe('student tenant-scoped persistence', () => {
  function portal(query: jest.Mock) {
    const unused = {} as never;
    return new StudentPortalService(
      { query } as never,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
    );
  }

  it('fails closed when profile does not exist in the authenticated tenant', async () => {
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]]>()
      .mockResolvedValue([]);
    await expect(
      portal(query).updateProfile(tenantId, studentId, { bank_details: {} }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('tenant_id = $2');
    expect(query.mock.calls[0][1]).toEqual([studentId, tenantId]);
  });

  it('scopes both profile read and update to the authenticated tenant', async () => {
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]]>()
      .mockResolvedValueOnce([
        { parent_info: {}, profile_unlocked_until: null },
      ])
      .mockResolvedValueOnce([]);
    await portal(query).updateProfile(tenantId, studentId, {
      bank_details: { account: '123' },
    });
    expect(query.mock.calls[1][0]).toContain('user_id = $2 AND tenant_id = $3');
    expect(query.mock.calls[1][1]).toEqual([
      { account: '123' },
      studentId,
      tenantId,
    ]);
  });

  it('requires tenant context before loading a finance ledger', async () => {
    const query = jest.fn<Promise<unknown[]>, [string, unknown[]]>();
    await expect(
      portal(query).getFinanceLedger(studentId, ''),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
  });

  it('does not generate or persist a resume for a cross-tenant student', async () => {
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]]>()
      .mockResolvedValue([]);
    const storage = { isEnabled: jest.fn() };
    const service = new PlacementService(
      { query } as never,
      {} as never,
      storage as never,
    );
    await expect(
      service.generateResumePdf(tenantId, 'other-tenant-student'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('tenant_id = $2');
    expect(query.mock.calls[0][1]).toEqual(['other-tenant-student', tenantId]);
    expect(storage.isEnabled).not.toHaveBeenCalled();
  });

  it('uses tenant-scoped user and resume data for authorized generation', async () => {
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]]>()
      .mockResolvedValueOnce([
        { name: 'Student A', official_email: 'a@example.test' },
      ])
      .mockResolvedValueOnce([{ skills: ['TypeScript'] }])
      .mockResolvedValueOnce([]);
    const storage = {
      isEnabled: () => true,
      buildKey: jest.fn().mockReturnValue('key'),
      upload: jest.fn().mockResolvedValue({ url: 's3://resume' }),
    };
    const service = new PlacementService(
      { query } as never,
      {} as never,
      storage as never,
    );
    await expect(
      service.generateResumePdf(tenantId, studentId),
    ).resolves.toEqual({ resume_pdf_path: 's3://resume' });
    expect(query.mock.calls[1][0]).toContain(
      'student_user_id = $1 AND tenant_id = $2',
    );
    expect(query.mock.calls[1][1]).toEqual([studentId, tenantId]);
    expect(query.mock.calls[2][1]).toEqual([
      tenantId,
      studentId,
      's3://resume',
    ]);
  });
});
