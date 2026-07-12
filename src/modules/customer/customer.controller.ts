import { BaseQuery } from '@common/base/query.base';
import { paginated } from '@common/types';
import { TENANT_MEMBER } from '@modules/auth/roles';
import { CustomerService } from '@modules/customer/customer.service';
import { CreateCustomerDto } from '@modules/customer/dto/create-customer.dto';
import {
  Authorized,
  Body,
  Get,
  HttpCode,
  JsonController,
  Param,
  Post,
  QueryParams,
} from 'routing-controllers';
import { Service } from 'typedi';

@Service()
@JsonController('/customers')
export class CustomerController {
  constructor(private readonly customers: CustomerService) {}

  @Get()
  @Authorized()
  async list(@QueryParams() query: BaseQuery) {
    const [items, total] = await this.customers.list(query);
    return paginated(items, query.page, query.limit, total);
  }

  @Get('/:id')
  @Authorized()
  get(@Param('id') id: string) {
    return this.customers.getById(id);
  }

  @Post()
  @HttpCode(201)
  @Authorized(TENANT_MEMBER)
  create(@Body() dto: CreateCustomerDto) {
    return this.customers.create(dto);
  }
}
