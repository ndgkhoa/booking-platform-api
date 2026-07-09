import type { BaseQuery } from '@common/base/query.base';
import { ConflictException, NotFoundException } from '@common/exceptions';
import type { CreateServiceDto } from '@modules/service/dto/create-service.dto';
import type { UpdateServiceDto } from '@modules/service/dto/update-service.dto';
import type { Service as ServiceEntity } from '@modules/service/service.entity';
import { ServiceRepository } from '@modules/service/service.repository';
import { Service } from 'typedi';

/** Application service managing the tenant's bookable-service catalog. */
@Service()
export class ServiceService {
  constructor(private readonly services: ServiceRepository) {}

  async create(dto: CreateServiceDto): Promise<ServiceEntity> {
    try {
      return await this.services.createOne(dto);
    } catch (error) {
      throw this.mapUniqueViolation(error);
    }
  }

  async getById(id: string): Promise<ServiceEntity> {
    const service = await this.services.findById(id);
    if (!service) {
      throw new NotFoundException('Service not found');
    }
    return service;
  }

  list(query: BaseQuery): Promise<[ServiceEntity[], number]> {
    return this.services.paginate(query);
  }

  async update(id: string, dto: UpdateServiceDto): Promise<ServiceEntity> {
    try {
      const updated = await this.services.update(id, dto);
      if (!updated) {
        throw new NotFoundException('Service not found');
      }
      return updated;
    } catch (error) {
      throw this.mapUniqueViolation(error);
    }
  }

  async remove(id: string): Promise<void> {
    if (!(await this.services.softRemove(id))) {
      throw new NotFoundException('Service not found');
    }
  }

  private mapUniqueViolation(error: unknown): unknown {
    if ((error as { code?: string }).code === '23505') {
      return new ConflictException('A service with this name already exists');
    }
    return error;
  }
}
