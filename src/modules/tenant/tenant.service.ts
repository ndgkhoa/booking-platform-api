import { ConflictException, NotFoundException } from '@common/exceptions';
import { MembershipRole } from '@common/types';
import { Membership } from '@modules/membership/membership.entity';
import type { CreateTenantDto } from '@modules/tenant/dto/create-tenant.dto';
import { Tenant } from '@modules/tenant/tenant.entity';
import { TenantRepository } from '@modules/tenant/tenant.repository';
import { Service } from 'typedi';
import { DataSource } from 'typeorm';

@Service()
export class TenantService {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly dataSource: DataSource,
  ) {}

  /** Uses the transaction manager directly instead of MembershipService — routing through another service would run on a separate connection and break atomicity. */
  async onboard(userId: string, input: CreateTenantDto): Promise<Tenant> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const tenantRepo = manager.getRepository(Tenant);
        const tenant = await tenantRepo.save(tenantRepo.create(input));
        const membershipRepo = manager.getRepository(Membership);
        await membershipRepo.save(
          membershipRepo.create({ userId, tenantId: tenant.id, role: MembershipRole.Owner }),
        );
        return tenant;
      });
    } catch (error) {
      // Unique slug is enforced by the DB; a concurrent insert surfaces here.
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('Tenant slug already in use');
      }
      throw error;
    }
  }

  async getById(id: string): Promise<Tenant> {
    const tenant = await this.tenants.findById(id);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  /** Platform-wide tenant listing for the super-admin console. */
  listAll(): Promise<Tenant[]> {
    return this.tenants.listAll();
  }
}
