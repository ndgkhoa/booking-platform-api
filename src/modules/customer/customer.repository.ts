import type { BaseQuery } from '@common/base/query.base';
import { BaseTenantRepository } from '@common/base/tenant-repository.base';
import { Customer } from '@modules/customer/customer.entity';
import { Service } from 'typedi';
import { DataSource } from 'typeorm';

@Service()
export class CustomerRepository extends BaseTenantRepository<Customer> {
  constructor(dataSource: DataSource) {
    super(dataSource, Customer);
  }

  createOne(data: Partial<Customer>): Promise<Customer> {
    return this.persist(data);
  }

  findById(id: string): Promise<Customer | null> {
    return this.findOne({ where: { id } });
  }

  paginate(query: BaseQuery): Promise<[Customer[], number]> {
    return this.findAndCount({
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      order: { name: 'ASC' },
    });
  }
}
