import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../entities/user.entity';
import { UserRole } from '../entities/user-role.entity';
import {
  AUTH_PROVIDER,
  type IAuthProvider,
} from './interfaces/auth-provider.interface';
import { TenantService } from '../tenant/tenant.service';

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
    const subdomain = tenantSubdomain ?? process.env.DEFAULT_TENANT_SUBDOMAIN ?? 'sgvu';
    const tenant = await this.tenantService.findBySubdomain(subdomain);

    // Load hash in a join-free query: password_hash has select:false and can be
    // dropped when combined with one-to-many joins in getOne().
    const credential = await this.userRepository
      .createQueryBuilder('user')
      .select('user.user_id', 'userId')
      .addSelect('user.password_hash', 'passwordHash')
      .addSelect('user.is_active', 'isActive')
      .where('LOWER(user.email) = LOWER(:email)', { email })
      .andWhere('user.tenant_id = :tenantId', { tenantId: tenant.tenant_id })
      .getRawOne<{ userId: string; passwordHash: string | null; isActive: boolean }>();

    if (!credential?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!credential.isActive) {
      throw new UnauthorizedException('User account is inactive');
    }

    const valid = await bcrypt.compare(password, credential.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const user = await this.findById(credential.userId, tenant.tenant_id);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.ensurePrimaryRoleMapping(user);
    const freshUser = await this.findById(user.user_id, tenant.tenant_id);
    const tokenUser = freshUser ?? user;
    const roleClaims = this.getRoleClaims(tokenUser);
    const token = this.signToken(tokenUser, tenant.tenant_id, tenant.pg_schema);
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
      },
    };
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
}
