import type { BaseQuery } from '@common/base/query.base';
import { BadRequestException, ConflictException, NotFoundException } from '@common/exceptions';
import { getTenantId } from '@common/tenant/tenant-context';
import { MembershipService } from '@modules/membership/membership.service';
import type { CreateStaffDto } from '@modules/staff/dto/create-staff.dto';
import type { UpdateStaffDto } from '@modules/staff/dto/update-staff.dto';
import type { Staff } from '@modules/staff/staff.entity';
import { StaffRepository } from '@modules/staff/staff.repository';
import { Service } from 'typedi';

/** Manages the tenant's staff directory (profiles). Capabilities live in StaffServiceService. */
@Service()
export class StaffService {
  constructor(
    private readonly staff: StaffRepository,
    private readonly memberships: MembershipService,
  ) {}

  async create(dto: CreateStaffDto): Promise<Staff> {
    // A staff profile must map to a member of this tenant.
    const role = await this.memberships.resolveRole(dto.userId, getTenantId());
    if (!role) {
      throw new BadRequestException('User is not a member of this tenant');
    }
    try {
      return await this.staff.createOne({ userId: dto.userId, displayName: dto.displayName });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('This user is already a staff member');
      }
      throw error;
    }
  }

  findById(id: string): Promise<Staff | null> {
    return this.staff.findById(id);
  }

  async getById(id: string): Promise<Staff> {
    const staff = await this.findById(id);
    if (!staff) {
      throw new NotFoundException('Staff not found');
    }
    return staff;
  }

  list(query: BaseQuery): Promise<[Staff[], number]> {
    return this.staff.paginate(query);
  }

  async update(id: string, dto: UpdateStaffDto): Promise<Staff> {
    const updated = await this.staff.update(id, dto);
    if (!updated) {
      throw new NotFoundException('Staff not found');
    }
    return updated;
  }

  async remove(id: string): Promise<void> {
    if (!(await this.staff.softRemove(id))) {
      throw new NotFoundException('Staff not found');
    }
  }
}
