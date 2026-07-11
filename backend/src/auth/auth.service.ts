import { Inject, Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../entities/user.entity';
import { UserRole } from '../entities/user-role.entity';
import {
  AUTH_PROVIDER,
  type IAuthProvider,
} from './interfaces/auth-provider.interface';
import { TenantService } from '../tenant/tenant.service';
import { resolveTenantSubdomain } from '../tenant/resolve-tenant-subdomain';
import { HrEntityContextService } from '../modules/hr/hr-entity-context.service';
import { normalizeOnboardingStatusForWizard } from '../modules/student-onboarding/onboarding-portal.util';
import { hasDirectReports } from '../modules/hr/utils/reporting-officer.util';

type LoginCredentialRow = {
  user_id: string;
  password_hash: string;
  is_active: boolean;
};

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserRole)
    private userRolesRepository: Repository<UserRole>,
    @Inject(AUTH_PROVIDER)
    private readonly authProvider: IAuthProvider,
    private readonly tenantService: TenantService,
    private readonly dataSource: DataSource,
    private readonly hrEntityCtx: HrEntityContextService,
  ) {}

  getProviderId(): string {
    return this.authProvider.providerId;
  }

  signToken(user: User, tenantId: string, tenantSchema: string): string {
    return this.authProvider.signToken(user, tenantId, tenantSchema);
  }

  validateDomainForTenant(email: string, allowedDomains: string[]): boolean {
    return this.authProvider.validateDomainForTenant(email, allowedDomains);
  }

  async validateUser(email: string, tenantId?: string): Promise<User | null> {
    const where: { email: string; tenant_id?: string } = { email };
    if (tenantId) where.tenant_id = tenantId;
    return this.userRepository.findOne({
      where,
      relations: ['role', 'department', 'userRoles', 'userRoles.role'],
    });
  }

  async findById(userId: string, tenantId?: string): Promise<User | null> {
    const where: { user_id: string; tenant_id?: string } = { user_id: userId };
    if (tenantId) where.tenant_id = tenantId;
    return this.userRepository.findOne({
      where,
      relations: ['role', 'department', 'userRoles', 'userRoles.role'],
    });
  }

  async localLogin(
    email: string,
    password: string,
    tenantSubdomain?: string,
  ): Promise<{ token: string; user: Record<string, unknown> }> {
    const subdomain = resolveTenantSubdomain(tenantSubdomain);
    const tenant = await this.tenantService.findBySubdomain(subdomain);

    const [credential] = await this.dataSource.query<LoginCredentialRow[]>(
      `SELECT user_id, password_hash, is_active
       FROM users
       WHERE LOWER(official_email) = LOWER($1)
         AND tenant_id = $2
       LIMIT 1`,
      [email, tenant.tenant_id],
    );

    if (!credential?.password_hash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!credential.is_active) {
      throw new UnauthorizedException('User account is inactive');
    }

    const valid = await bcrypt.compare(password, credential.password_hash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const user = await this.findById(credential.user_id, tenant.tenant_id);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.ensurePrimaryRoleMapping(user);
    const freshUser = await this.findById(user.user_id, tenant.tenant_id);
    const tokenUser = freshUser ?? user;
    const roleClaims = this.getRoleClaims(tokenUser);
    const token = this.signToken(tokenUser, tenant.tenant_id, tenant.pg_schema);
    const caps = await this.hrEntityCtx.getPermissions(
      tenant.tenant_id,
      tokenUser.user_id,
    );
    const permissions = this.hrEntityCtx.capabilitiesToPermissionList(caps);
    const allowedRows = await this.hrEntityCtx.listAllowedEntities(
      tenant.tenant_id,
      tokenUser.user_id,
      roleClaims.roles,
    );
    const directReports = await hasDirectReports(
      (sql, params) => this.dataSource.query(sql, params),
      tenant.tenant_id,
      tokenUser.user_id,
    );
    const isDepartmentHod = await this.isDepartmentHod(tokenUser.user_id);
    return {
      token,
      user: {
        user_id: tokenUser.user_id,
        email: tokenUser.email,
        name: tokenUser.name,
        role: roleClaims.primaryRole,
        roles: roleClaims.roles,
        primaryRole: roleClaims.primaryRole,
        role_id: tokenUser.role_id,
        department: tokenUser.department?.dept_name,
        dept_id: tokenUser.dept_id,
        tenant_id: tenant.tenant_id,
        tenant_schema: tenant.pg_schema,
        hr_capabilities: caps ?? {},
        permissions,
        allowed_entities: this.hrEntityCtx.formatAllowedEntities(allowedRows),
        onboarding_status: normalizeOnboardingStatusForWizard(
          tokenUser.onboarding_status,
          roleClaims.primaryRole,
        ),
        has_direct_reports: directReports,
        is_department_hod: isDepartmentHod,
      },
    };
  }

  async isDepartmentHod(userId: string): Promise<boolean> {
    const rows = await this.dataSource.query<Array<{ is_hod: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM departments WHERE hod_user_id = $1
       ) AS is_hod`,
      [userId],
    );
    return Boolean(rows[0]?.is_hod);
  }

  async ensurePrimaryRoleMapping(user: User) {
    if (!user.role_id) return;
    const existing = await this.userRolesRepository.findOne({
      where: { user_id: user.user_id, role_id: user.role_id },
    });
    if (!existing) {
      await this.userRolesRepository.save({
        user_id: user.user_id,
        role_id: user.role_id,
        is_primary: true,
      });
      return;
    }
    if (!existing.is_primary) {
      const primaryCount = await this.userRolesRepository.count({
        where: { user_id: user.user_id, is_primary: true },
      });
      if (primaryCount === 0) {
        existing.is_primary = true;
        await this.userRolesRepository.save(existing);
      }
    }
  }

  /** Secondary Faculty role for HOD users assigned active teaching load. */
  async ensureTeachingFacultyRoleForHod(userId: string): Promise<void> {
    if (!userId) return;
    await this.dataSource.query(
      `INSERT INTO user_roles (user_id, role_id, is_primary)
       SELECT $1, rf.role_id, false
       FROM roles rf
       WHERE rf.role_name = 'Faculty'
         AND EXISTS (
           SELECT 1
           FROM user_roles ur
           INNER JOIN roles rh ON rh.role_id = ur.role_id
           WHERE ur.user_id = $1 AND rh.role_name = 'HOD'
         )
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [userId],
    );
  }

  /** Resolve guardian mobile for Parent-role users (password login → parent portal APIs). */
  async resolveParentMobile(
    tenantId: string,
    email: string,
  ): Promise<string | null> {
    const rows = await this.dataSource.query<Array<{ parent_mobile: string }>>(
      `SELECT parent_mobile FROM parent_student_links
       WHERE tenant_id = $1 AND LOWER(COALESCE(parent_email, '')) = LOWER($2)
       LIMIT 1`,
      [tenantId, email],
    );
    return rows[0]?.parent_mobile ?? null;
  }

  getRoleClaims(user: User): { roles: string[]; primaryRole?: string } {
    const mapped = (user.userRoles ?? [])
      .filter((row) => row.role?.role_name)
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
      .map((row) => row.role.role_name);
    const roles = Array.from(new Set(mapped));
    if (user.role?.role_name && !roles.includes(user.role.role_name)) {
      roles.unshift(user.role.role_name);
    }
    return {
      roles,
      primaryRole:
        user.userRoles?.find((row) => row.is_primary)?.role?.role_name ??
        user.role?.role_name ??
        roles[0],
    };
  }

  async changePassword(
    userId: string,
    tenantId: string | undefined,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: true; onboarding_status?: string }> {
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException(
        'New password must be at least 8 characters',
      );
    }
    if (newPassword === currentPassword) {
      throw new BadRequestException(
        'New password must be different from your current password',
      );
    }
    if (newPassword === 'password123') {
      throw new BadRequestException(
        'Please choose a password different from the default',
      );
    }

    const [row] = await this.dataSource.query<
      Array<{ password_hash: string | null; onboarding_status: string | null }>
    >(
      `SELECT password_hash, onboarding_status
       FROM users
       WHERE user_id = $1 AND ($2::uuid IS NULL OR tenant_id = $2)`,
      [userId, tenantId ?? null],
    );
    if (!row?.password_hash) {
      throw new UnauthorizedException('Invalid current password');
    }

    const valid = await bcrypt.compare(currentPassword, row.password_hash);
    if (!valid) {
      throw new UnauthorizedException('Invalid current password');
    }

    const hash = await bcrypt.hash(newPassword, 10);
    let onboardingStatus = row.onboarding_status ?? 'ACTIVE';
    if (onboardingStatus === 'PENDING_PASSWORD_RESET') {
      onboardingStatus = 'PENDING_DOCUMENTS';
    }

    await this.dataSource.query(
      `UPDATE users
       SET password_hash = $1, onboarding_status = $2, updated_at = NOW()
       WHERE user_id = $3`,
      [hash, onboardingStatus, userId],
    );

    return { success: true, onboarding_status: onboardingStatus };
  }
}
