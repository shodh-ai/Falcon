import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User } from '../entities/user.entity';
import { UserRole } from '../entities/user-role.entity';
import { AUTH_PROVIDER } from './interfaces/auth-provider.interface';
import { TenantService } from '../tenant/tenant.service';
import { HrEntityContextService } from '../modules/hr/hr-entity-context.service';

jest.mock('bcrypt');

const PASSWORD_HASH =
  '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO';

const TENANT = {
  tenant_id: 'a0000000-0000-4000-8000-000000000001',
  pg_schema: 'tenant_sgvu',
  subdomain: 'sgvu',
};

function buildLoginFixture(overrides: {
  user_id?: string;
  email?: string;
  name?: string;
  role_id?: number;
  roleName: string;
  dept_id?: number | null;
  dept_name?: string | null;
  onboarding_status?: string | null;
}) {
  const user_id = overrides.user_id ?? 'user-1';
  const email = overrides.email ?? 'library@mygyanvihar.com';
  const name = overrides.name ?? 'Chief Librarian';
  const role_id = overrides.role_id ?? 9;
  const roleName = overrides.roleName;
  const dept_id = overrides.dept_id ?? null;
  const dept_name = overrides.dept_name ?? null;
  const onboarding_status = overrides.onboarding_status ?? 'ACTIVE';

  return {
    credential: {
      user_id,
      password_hash: PASSWORD_HASH,
      is_active: true,
    },
    userRow: {
      user_id,
      name,
      email,
      role_id,
      dept_id,
      onboarding_status,
      role_name: roleName,
      dept_name,
    },
    roleRows: [
      {
        role_id,
        is_primary: true,
        role_name: roleName,
      },
    ],
  };
}

describe('AuthService.localLogin', () => {
  let service: AuthService;

  const mockDataSource = {
    query: jest.fn(),
  };

  const mockUserRepository = {
    findOne: jest.fn(),
  };

  const mockUserRolesRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    count: jest.fn(),
  };

  const mockTenantService = {
    findBySubdomain: jest.fn(),
  };

  const mockHrEntityCtx = {
    getPermissions: jest.fn(),
    capabilitiesToPermissionList: jest.fn(),
    listAllowedEntities: jest.fn(),
    formatAllowedEntities: jest.fn(),
  };

  const mockAuthProvider = {
    providerId: 'local',
    signToken: jest.fn(),
  };

  function mockSuccessfulLoginQueries(
    fixture: ReturnType<typeof buildLoginFixture>,
  ) {
    mockDataSource.query.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('password_hash')) {
        return [fixture.credential];
      }
      if (text.includes('official_email AS email')) {
        return [fixture.userRow];
      }
      if (text.includes('FROM user_roles ur')) {
        return fixture.roleRows;
      }
      if (text.includes('COUNT(*)')) {
        return [{ count: '0' }];
      }
      if (text.includes('EXISTS')) {
        return [{ is_hod: false }];
      }
      return [];
    });
  }

  beforeEach(async () => {
    jest.clearAllMocks();

    mockDataSource.query.mockImplementation(async (sql: string) => {
      if (String(sql).includes('COUNT(*)')) {
        return [{ count: '0' }];
      }
      return [];
    });

    mockTenantService.findBySubdomain.mockResolvedValue(TENANT);
    mockHrEntityCtx.getPermissions.mockResolvedValue({});
    mockHrEntityCtx.capabilitiesToPermissionList.mockReturnValue([]);
    mockHrEntityCtx.listAllowedEntities.mockResolvedValue([]);
    mockHrEntityCtx.formatAllowedEntities.mockReturnValue([]);
    mockAuthProvider.signToken.mockReturnValue('signed-jwt');
    mockUserRolesRepository.findOne.mockResolvedValue({ is_primary: true });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        {
          provide: getRepositoryToken(UserRole),
          useValue: mockUserRolesRepository,
        },
        { provide: TenantService, useValue: mockTenantService },
        { provide: HrEntityContextService, useValue: mockHrEntityCtx },
        { provide: AUTH_PROVIDER, useValue: mockAuthProvider },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('returns token and Librarian role for library@ master persona', async () => {
    const fixture = buildLoginFixture({
      email: 'library@mygyanvihar.com',
      roleName: 'Librarian',
    });
    mockSuccessfulLoginQueries(fixture);

    const result = await service.localLogin(
      'library@mygyanvihar.com',
      'password123',
      'sgvu',
    );

    expect(result.token).toBe('signed-jwt');
    expect(result.user.role).toBe('Librarian');
    expect(result.user.roles).toContain('Librarian');
    expect(mockTenantService.findBySubdomain).toHaveBeenCalledWith('sgvu');
    expect(mockUserRepository.findOne).not.toHaveBeenCalled();
  });

  it('falls back to sgvu when tenant subdomain header is empty', async () => {
    const fixture = buildLoginFixture({
      email: 'library@mygyanvihar.com',
      name: 'Library',
      role_id: 11,
      roleName: 'Librarian',
    });
    mockSuccessfulLoginQueries(fixture);

    await service.localLogin('library@mygyanvihar.com', 'password123', '   ');

    expect(mockTenantService.findBySubdomain).toHaveBeenCalledWith('sgvu');
  });

  it('returns token and Registrar role for dev.registrar@ persona', async () => {
    const fixture = buildLoginFixture({
      user_id: 'user-registrar',
      email: 'dev.registrar@mygyanvihar.com',
      name: 'Dev Registrar',
      role_id: 12,
      roleName: 'Registrar',
    });
    mockSuccessfulLoginQueries(fixture);

    const result = await service.localLogin(
      'dev.registrar@mygyanvihar.com',
      'password123',
    );

    expect(result.token).toBe('signed-jwt');
    expect(result.user.role).toBe('Registrar');
    expect(result.user.email).toBe('dev.registrar@mygyanvihar.com');
  });

  it('throws when password_hash is missing', async () => {
    mockDataSource.query.mockResolvedValueOnce([
      { user_id: 'user-1', password_hash: null, is_active: true },
    ]);

    await expect(
      service.localLogin('dev.librarian@mygyanvihar.com', 'password123'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws when no credential row exists for tenant', async () => {
    mockDataSource.query.mockResolvedValueOnce([]);

    await expect(
      service.localLogin('dev.librarian@mygyanvihar.com', 'password123'),
    ).rejects.toThrow('Invalid email or password');
  });

  it('throws when password does not match hash', async () => {
    mockDataSource.query.mockResolvedValueOnce([
      { user_id: 'user-1', password_hash: PASSWORD_HASH, is_active: true },
    ]);
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

    await expect(
      service.localLogin('library@mygyanvihar.com', 'wrong-password'),
    ).rejects.toThrow('Invalid email or password');
  });

  it('still returns token when HR enrichment fails', async () => {
    const fixture = buildLoginFixture({
      email: 'library@mygyanvihar.com',
      roleName: 'Librarian',
    });
    mockSuccessfulLoginQueries(fixture);
    mockHrEntityCtx.getPermissions.mockRejectedValueOnce(
      new Error('Redis connection refused'),
    );

    const result = await service.localLogin(
      'library@mygyanvihar.com',
      'password123',
      'sgvu',
    );

    expect(result.token).toBe('signed-jwt');
    expect(result.user.role).toBe('Librarian');
    expect(result.user.permissions).toEqual([]);
  });
});
