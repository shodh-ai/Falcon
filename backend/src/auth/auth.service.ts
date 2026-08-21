import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
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
import { isStudentEnrollmentEmail } from './utils/student-enrollment-email.util';
import { hasDirectReports } from '../modules/hr/utils/reporting-officer.util';

type LoginCredentialRow = {
  user_id: string;
  password_hash: string;
  is_active: boolean;
};

type LoginUserRow = {
  user_id: string;
  name: string;
  email: string;
  role_id: number | null;
  dept_id: number | null;
  onboarding_status: string | null;
  role_name: string | null;
  dept_name: string | null;
};

type LoginRoleRow = {
  role_id: number;
  is_primary: boolean;
  role_name: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

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

  /**
   * Minimal user payload for password login. Avoids TypeORM soft-delete
   * columns (deleted_at on roles/departments/user_roles) that break prod
   * when those migrations have not been applied.
   */
  private async loadUserForLogin(
    userId: string,
    tenantId: string,
  ): Promise<User | null> {
    const [row] = await this.dataSource.query<LoginUserRow[]>(
      `SELECT u.user_id,
              u.name,
              u.official_email AS email,
              u.role_id,
              u.dept_id,
              u.onboarding_status,
              r.role_name,
              d.dept_name
       FROM users u
       LEFT JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE u.user_id = $1
         AND u.tenant_id = $2
       LIMIT 1`,
      [userId, tenantId],
    );
    if (!row) return null;

    const roleRows = await this.dataSource.query<LoginRoleRow[]>(
      `SELECT ur.role_id, ur.is_primary, r.role_name
       FROM user_roles ur
       INNER JOIN roles r ON r.role_id = ur.role_id
       WHERE ur.user_id = $1`,
      [userId],
    );

    return {
      user_id: row.user_id,
      tenant_id: tenantId,
      name: row.name,
      email: row.email,
      role_id: row.role_id,
      dept_id: row.dept_id,
      onboarding_status: row.onboarding_status,
      role: row.role_name
        ? ({
            role_id: row.role_id ?? undefined,
            role_name: row.role_name,
          } as User['role'])
        : undefined,
      department: row.dept_name
        ? ({
            dept_id: row.dept_id ?? undefined,
            dept_name: row.dept_name,
          } as User['department'])
        : undefined,
      userRoles: roleRows.map(
        (rr) =>
          ({
            user_id: row.user_id,
            role_id: rr.role_id,
            is_primary: Boolean(rr.is_primary),
            role: { role_id: rr.role_id, role_name: rr.role_name },
          }) as UserRole,
      ),
    } as User;
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
      await this.recordLoginAttempt(
        tenant.tenant_id,
        credential.user_id,
        email,
        false,
      );
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.recordLoginAttempt(
      tenant.tenant_id,
      credential.user_id,
      email,
      true,
    );

    // Raw SQL only — TypeORM findById joins soft-delete columns on roles /
    // departments / user_roles and 500s when those migrations are missing in prod.
    const tokenUser = await this.loadUserForLogin(
      credential.user_id,
      tenant.tenant_id,
    );
    if (!tokenUser) {
      throw new UnauthorizedException('Invalid email or password');
    }

    try {
      await this.ensurePrimaryRoleMapping(tokenUser);
    } catch (err) {
      this.logger.warn(
        `ensurePrimaryRoleMapping failed for ${tokenUser.user_id}: ${err instanceof Error ? err.message : err}`,
      );
    }

    const syncedUser = await this.loadUserWithSyncedWorkspaceRoles(
      credential.user_id,
      tenant.tenant_id,
    );
    const tokenUserForClaims = syncedUser ?? tokenUser;
    const roleClaims = this.getRoleClaims(tokenUserForClaims);
    // Issue token before optional enrichment so Redis/HR schema faults cannot block login.
    const token = this.signToken(
      tokenUserForClaims,
      tenant.tenant_id,
      tenant.pg_schema,
    );

    let caps: Awaited<ReturnType<HrEntityContextService['getPermissions']>> =
      null;
    let permissions: string[] = [];
    let allowedEntities: ReturnType<
      HrEntityContextService['formatAllowedEntities']
    > = [];
    let directReports = false;
    let isDepartmentHod = false;
    try {
      caps = await this.hrEntityCtx.getPermissions(
        tenant.tenant_id,
        tokenUser.user_id,
      );
      permissions = this.hrEntityCtx.capabilitiesToPermissionList(caps);
      const allowedRows = await this.hrEntityCtx.listAllowedEntities(
        tenant.tenant_id,
        tokenUser.user_id,
        roleClaims.roles,
      );
      allowedEntities = this.hrEntityCtx.formatAllowedEntities(allowedRows);
      directReports = await hasDirectReports(
        (sql, params) => this.dataSource.query(sql, params),
        tenant.tenant_id,
        tokenUser.user_id,
      );
      isDepartmentHod = await this.isDepartmentHod(tokenUser.user_id);
    } catch (err) {
      this.logger.error(
        `localLogin enrichment failed for ${tokenUser.user_id}; returning token without HR context: ${err instanceof Error ? err.message : err}`,
      );
    }

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
        allowed_entities: allowedEntities,
        onboarding_status: normalizeOnboardingStatusForWizard(
          tokenUser.onboarding_status,
          roleClaims.primaryRole,
        ),
        has_direct_reports: directReports,
        is_department_hod: isDepartmentHod,
        last_login_at: new Date().toISOString(),
      },
    };
  }

  private async recordLoginAttempt(
    tenantId: string,
    userId: string,
    email: string,
    success: boolean,
  ) {
    try {
      if (success) {
        await this.dataSource.query(
          `UPDATE users
           SET last_login_at = NOW(), account_status = COALESCE(NULLIF(account_status, ''), 'ACTIVE')
           WHERE user_id = $1 AND tenant_id = $2`,
          [userId, tenantId],
        );
      }
      await this.dataSource.query(
        `INSERT INTO admin_login_history (tenant_id, user_id, email, success)
         VALUES ($1, $2, $3, $4)`,
        [tenantId, userId, email.toLowerCase(), success],
      );
      if (success) {
        await this.dataSource.query(
          `INSERT INTO admin_control_audit
             (tenant_id, actor_user_id, action, resource_type, resource_id, details)
           VALUES ($1, $2, 'LOGIN', 'session', $2::text, '{"source":"local-login"}'::jsonb)`,
          [tenantId, userId],
        );
      }
    } catch {
      // Login history tables may be missing until migration; never block auth.
    }
  }

  async forgotPassword(
    email: string,
    tenantSubdomain?: string,
  ): Promise<{ sent: true; reset_token?: string }> {
    const subdomain = resolveTenantSubdomain(tenantSubdomain);
    const tenant = await this.tenantService.findBySubdomain(subdomain);
    const [user] = await this.dataSource.query<
      Array<{ user_id: string; is_active: boolean }>
    >(
      `SELECT user_id, is_active FROM users
       WHERE tenant_id = $1 AND lower(official_email) = lower($2)
       LIMIT 1`,
      [tenant.tenant_id, email.trim()],
    );
    if (!user?.is_active) {
      return { sent: true };
    }
    const raw = randomBytes(24).toString('hex');
    const tokenHash = createHash('sha256').update(raw).digest('hex');
    try {
      await this.dataSource.query(
        `INSERT INTO admin_password_reset_tokens
           (tenant_id, user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour')`,
        [tenant.tenant_id, user.user_id, tokenHash],
      );
    } catch {
      return { sent: true };
    }
    return process.env.NODE_ENV === 'production'
      ? { sent: true }
      : { sent: true, reset_token: raw };
  }

  async resetPasswordWithToken(
    token: string,
    newPassword: string,
  ): Promise<{ success: true }> {
    if (!token || newPassword.length < 8) {
      throw new BadRequestException('Invalid token or password');
    }
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const [row] = await this.dataSource.query<
      Array<{ token_id: string; user_id: string; tenant_id: string }>
    >(
      `SELECT token_id, user_id, tenant_id
       FROM admin_password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash],
    );
    if (!row) throw new BadRequestException('Reset link expired or invalid');
    const hash = await bcrypt.hash(newPassword, 10);
    await this.dataSource.query(
      `UPDATE users SET password_hash = $1, onboarding_status = 'COMPLETED', updated_at = NOW()
       WHERE user_id = $2 AND tenant_id = $3`,
      [hash, row.user_id, row.tenant_id],
    );
    await this.dataSource.query(
      `UPDATE admin_password_reset_tokens SET used_at = NOW() WHERE token_id = $1`,
      [row.token_id],
    );
    return { success: true };
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

  /**
   * Google OAuth can auto-provision Faculty before department import runs.
   * Enrollment-style student emails (or existing student profiles) must stay Student.
   */
  async correctStudentRoleForEnrollmentEmail(
    user: User,
    tenantId: string,
  ): Promise<User | null> {
    const email = user.email ?? '';
    if (!isStudentEnrollmentEmail(email)) return user;

    const roleName = (user.role?.role_name ?? '').trim();
    if (roleName === 'Student' || roleName === 'Applicant') return user;

    const profileRows = await this.dataSource.query<Array<{ user_id: string }>>(
      `SELECT user_id FROM student_profiles
       WHERE user_id = $1 AND tenant_id = $2
       LIMIT 1`,
      [user.user_id, tenantId],
    );
    const hasStudentProfile = profileRows.length > 0;
    if (!hasStudentProfile && roleName !== 'Faculty') return user;

    const studentRoleRows = await this.dataSource.query<
      Array<{ role_id: number }>
    >(`SELECT role_id FROM roles WHERE role_name = 'Student' LIMIT 1`);
    const studentRoleId = studentRoleRows[0]?.role_id;
    if (!studentRoleId) return user;

    await this.dataSource.query(
      `UPDATE users
       SET role_id = $1,
           onboarding_status = CASE
             WHEN onboarding_status IN ('COMPLETED', 'PENDING_ADMIN_APPROVAL', 'PENDING_DOCUMENTS', 'PENDING_PASSWORD_RESET')
               THEN onboarding_status
             WHEN $3 THEN 'COMPLETED'
             ELSE onboarding_status
           END,
           updated_at = NOW()
       WHERE user_id = $2`,
      [studentRoleId, user.user_id, hasStudentProfile],
    );

    await this.dataSource.query(
      `DELETE FROM user_roles ur
       USING roles r
       WHERE ur.role_id = r.role_id
         AND ur.user_id = $1
         AND r.role_name IN ('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin')`,
      [user.user_id],
    );

    await this.dataSource.query(
      `INSERT INTO user_roles (user_id, role_id, is_primary)
       VALUES ($1, $2, true)
       ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
      [user.user_id, studentRoleId],
    );

    this.logger.log(
      `Corrected Google login role to Student for ${email} (was ${roleName || 'unknown'})`,
    );

    return this.userRepository.findOne({
      where: { user_id: user.user_id, tenant_id: tenantId },
      relations: ['role', 'department', 'userRoles', 'userRoles.role'],
    });
  }

  /** Secondary Faculty role for HOD users — enables HOD ↔ Faculty workspace switcher. */
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

  /** Secondary Dean role for HOD users — HODs also act as school/department Deans here. */
  async ensureDeanRoleForHod(userId: string): Promise<void> {
    if (!userId) return;
    await this.dataSource.query(
      `INSERT INTO user_roles (user_id, role_id, is_primary)
       SELECT $1, rd.role_id, false
       FROM roles rd
       WHERE rd.role_name = 'Dean'
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

  /** Keep multi-hat workspace roles in sync before resolving JWT/login role claims. */
  async syncMultiHatWorkspaceRoles(userId: string): Promise<void> {
    if (!userId) return;
    await this.ensureTeachingFacultyRoleForHod(userId);
    await this.ensureDeanRoleForHod(userId);
  }

  async loadUserWithSyncedWorkspaceRoles(
    userId: string,
    tenantId: string,
  ): Promise<User | null> {
    await this.syncMultiHatWorkspaceRoles(userId);
    return this.loadUserForLogin(userId, tenantId);
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
