import { getTenantId } from '@common/context/tenant-context';
import { NotFoundException } from '@common/exceptions';
import { type ApiResponse, paginated } from '@common/types/response';
import { TenantMemberRepository } from '@modules/tenant/tenant-member.repository';
import type { UserQuery } from '@modules/user/dto/query.dto';
import type { User } from '@modules/user/user.entity';
import { UserRepository } from '@modules/user/user.repository';
import { isUUID } from 'class-validator';
import { Service } from 'typedi';

/** Reject a malformed id up front so it never reaches a `uuid` column (→ 500). */
function assertUuid(id: string): void {
  if (!isUUID(id)) {
    throw new NotFoundException(`User ${id} not found`);
  }
}

/**
 * User read/management scoped to the caller's tenant. A user is a global
 * identity, but these endpoints only ever see or touch users who are members of
 * the active tenant — an owner manages their own tenant's people, never another
 * tenant's.
 */
@Service()
export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly members: TenantMemberRepository,
  ) {}

  async getById(id: string): Promise<User> {
    assertUuid(id);
    const user = await this.users.findByIdInTenant(id, this.tenantId());
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  async list(query: UserQuery): Promise<ApiResponse<User[]>> {
    const [items, total] = await this.users.paginateInTenant(this.tenantId(), query);
    return paginated(items, query.page, query.limit, total);
  }

  /** Remove a user from the caller's tenant (soft-delete the membership). */
  async delete(id: string): Promise<void> {
    assertUuid(id);
    const removed = await this.members.removeFromTenant(id, this.tenantId());
    if (!removed) {
      throw new NotFoundException(`User ${id} not found`);
    }
  }

  private tenantId(): string {
    const tenantId = getTenantId();
    if (!tenantId) {
      throw new NotFoundException('No active tenant context');
    }
    return tenantId;
  }
}
