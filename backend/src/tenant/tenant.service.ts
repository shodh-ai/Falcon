import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../entities/tenant.entity';
import { TenantSubscription } from '../entities/tenant-subscription.entity';

export type TenantBrandingDto = {
  tenantId: string;
  name: string;
  subdomain: string;
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  features: string[];
};

@Injectable()
export class TenantService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenants: Repository<Tenant>,
    @InjectRepository(TenantSubscription)
    private readonly subscriptions: Repository<TenantSubscription>,
  ) {}

  async findBySubdomain(subdomain: string): Promise<Tenant> {
    const tenant = await this.tenants.findOne({
      where: { subdomain: subdomain.toLowerCase(), is_active: true },
    });
    if (!tenant) {
      throw new NotFoundException(`University portal "${subdomain}" not found`);
    }
    return tenant;
  }

  async findById(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenants.findOne({
      where: { tenant_id: tenantId, is_active: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  async getEnabledFeatures(tenantId: string): Promise<Set<string>> {
    const rows = await this.subscriptions.find({
      where: { tenant_id: tenantId, is_enabled: true },
    });
    const now = new Date();
    return new Set(
      rows
        .filter((r) => !r.expires_at || new Date(r.expires_at) >= now)
        .map((r) => r.feature_key),
    );
  }

  async getBrandingBySubdomain(subdomain: string): Promise<TenantBrandingDto> {
    const tenant = await this.findBySubdomain(subdomain);
    const features = await this.getEnabledFeatures(tenant.tenant_id);
    return this.toBrandingDto(tenant, features);
  }

  async getBrandingById(tenantId: string): Promise<TenantBrandingDto> {
    const tenant = await this.findById(tenantId);
    const features = await this.getEnabledFeatures(tenant.tenant_id);
    return this.toBrandingDto(tenant, features);
  }

  getSetting<T>(tenant: Tenant, key: string, fallback: T): T {
    const value = tenant.settings?.[key];
    return (value !== undefined && value !== null ? value : fallback) as T;
  }

  private toBrandingDto(
    tenant: Tenant,
    features: Set<string>,
  ): TenantBrandingDto {
    return {
      tenantId: tenant.tenant_id,
      name: tenant.name,
      subdomain: tenant.subdomain,
      primaryColor: tenant.primary_color,
      accentColor: tenant.accent_color,
      logoUrl: tenant.logo_url,
      features: Array.from(features),
    };
  }
}
