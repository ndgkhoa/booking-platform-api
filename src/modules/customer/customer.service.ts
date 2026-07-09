import type { BaseQuery } from '@common/base/query.base';
import { ConflictException, NotFoundException } from '@common/exceptions';
import type { Customer } from '@modules/customer/customer.entity';
import { CustomerRepository } from '@modules/customer/customer.repository';
import type { CreateCustomerDto } from '@modules/customer/dto/create-customer.dto';
import { Service } from 'typedi';

@Service()
export class CustomerService {
  constructor(private readonly customers: CustomerRepository) {}

  async create(dto: CreateCustomerDto): Promise<Customer> {
    try {
      return await this.customers.createOne({ ...dto, email: dto.email.toLowerCase() });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('A customer with this email already exists');
      }
      throw error;
    }
  }

  async getById(id: string): Promise<Customer> {
    const customer = await this.customers.findById(id);
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return customer;
  }

  list(query: BaseQuery): Promise<[Customer[], number]> {
    return this.customers.paginate(query);
  }
}
