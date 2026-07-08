import { ConflictException, NotFoundException } from '@common/exceptions';
import type { Tenant } from '@modules/tenant/tenant.entity';
import { TenantRepository } from '@modules/tenant/tenant.repository';
import { Service } from 'typedi';

export interface CreateTenantInput {
  name: string;
  slug: string;
  timezone?: string;
}

@Service()
export class TenantService {
  constructor(private readonly tenants: TenantRepository) {}

  async create(input: CreateTenantInput): Promise<Tenant> {
    if (await this.tenants.findBySlug(input.slug)) {
      throw new ConflictException('Tenant slug already in use');
    }
    return this.tenants.create(input);
  }

  async getById(id: string): Promise<Tenant> {
    const tenant = await this.tenants.findById(id);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }
}
