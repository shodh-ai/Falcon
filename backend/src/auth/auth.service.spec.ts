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

function buildUser(overrides: Partial<User> & { roleName: string }): User {
  const { roleName, ...rest } = overrides;
  return {
    user_id: rest.user_id ?? 'user-1',
    tenant_id: rest.tenant_id ?? TENANT.tenant_id,
    email: rest.email ?? 'library@mygyanvihar.com',
    name: rest.name ?? 'Chief Librarian',
    role_id: rest.role_id ?? 9,
    is_active: rest.is_active ?? true,
    onboarding_status: rest.onboarding_status ?? 'ACTIVE',
    role: { role_id: rest.role_id ?? 9, role_name: roleName } as User['role'],
    userRoles: [
      {
        is_primary: true,
        role: { role_name: roleName },
      } as UserRole,
    ],
    department: undefined,
    dept_id: null,
  } as User;
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

  beforeEach(async () => {
    jest.clearAllMocks();

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
        { provide: getRepositoryToken(UserRole), useValue: mockUserRolesRepository },
        { provide: TenantService, useValue: mockTenantService },
        { provide: HrEntityContextService, useValue: mockHrEntityCtx },
        { provide: AUTH_PROVIDER, useValue: mockAuthProvider },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('returns token and Librarian role for library@ master persona', async () => {
    const user = buildUser({
      email: 'library@mygyanvihar.com',
      roleName: 'Librarian',
    });

    mockDataSource.query.mockResolvedValueOnce([
      { user_id: user.user_id, password_hash: PASSWORD_HASH, is_active: true },
    ]);
    mockUserRepository.findOne.mockResolvedValue(user);

    const result = await service.localLogin(
      'library@mygyanvihar.com',
      'password123',
      'sgvu',
    );

    expect(result.token).toBe('signed-jwt');
    expect(result.user.role).toBe('Librarian');
    expect(result.user.roles).toContain('Librarian');
    expect(mockTenantService.findBySubdomain).toHaveBeenCalledWith('sgvu');
  });

  it('returns token and Registrar role for dev.registrar@ persona', async () => {
    const user = buildUser({
      user_id: 'user-registrar',
      email: 'dev.registrar@mygyanvihar.com',
      name: 'Dev Registrar',
      role_id: 12,
      roleName: 'Registrar',
    });

    mockDataSource.query.mockResolvedValueOnce([
      { user_id: user.user_id, password_hash: PASSWORD_HASH, is_active: true },
    ]);
    mockUserRepository.findOne.mockResolvedValue(user);

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
});
