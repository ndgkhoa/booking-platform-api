import { ConflictException, NotFoundException } from '@common/exceptions';
import { Membership } from '@modules/membership/membership.entity';
import { Tenant } from '@modules/tenant/tenant.entity';
import { TenantRepository } from '@modules/tenant/tenant.repository';
import { Service } from 'typedi';
import { DataSource } from 'typeorm';

export interface CreateTenantInput {
  name: string;
  slug: string;
  timezone?: string;
}

@Service()
export class TenantService {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly dataSource: DataSource,
  ) {}

  /** Creates a tenant and its owner membership atomically. */
  async onboard(userId: string, input: CreateTenantInput): Promise<Tenant> {
    return this.dataSource.transaction(async (manager) => {
      const tenantRepo = manager.getRepository(Tenant);
      if (await tenantRepo.findOne({ where: { slug: input.slug } })) {
        throw new ConflictException('Tenant slug already in use');
      }
      const tenant = await tenantRepo.save(tenantRepo.create(input));
      const membershipRepo = manager.getRepository(Membership);
      await membershipRepo.save(
        membershipRepo.create({ userId, tenantId: tenant.id, role: 'owner' }),
      );
      return tenant;
    });
  }

  async getById(id: string): Promise<Tenant> {
    const tenant = await this.tenants.findById(id);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }
}
