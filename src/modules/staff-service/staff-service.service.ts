import { ConflictException, NotFoundException } from '@common/exceptions';
import { ServiceService } from '@modules/service/service.service';
import { StaffService } from '@modules/staff/staff.service';
import type { StaffService as StaffServiceEntity } from '@modules/staff-service/staff-service.entity';
import { StaffServiceRepository } from '@modules/staff-service/staff-service.repository';
import { Service } from 'typedi';

/** Manages which services each staff member can perform (the staff↔service link). */
@Service()
export class StaffServiceService {
  constructor(
    private readonly staffServices: StaffServiceRepository,
    private readonly staff: StaffService,
    private readonly services: ServiceService,
  ) {}

  async link(staffId: string, serviceId: string): Promise<StaffServiceEntity> {
    await this.staff.getById(staffId); // 404 if the staff is missing in this tenant
    await this.services.getById(serviceId); // 404 if the service is missing in this tenant
    try {
      return await this.staffServices.link(staffId, serviceId);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('Service already linked to this staff');
      }
      throw error;
    }
  }

  async unlink(staffId: string, serviceId: string): Promise<void> {
    if (!(await this.staffServices.unlink(staffId, serviceId))) {
      throw new NotFoundException('Capability not found');
    }
  }

  list(staffId: string): Promise<StaffServiceEntity[]> {
    return this.staffServices.listForStaff(staffId);
  }

  async canPerform(staffId: string, serviceId: string): Promise<boolean> {
    return (await this.staffServices.findLink(staffId, serviceId)) !== null;
  }
}
