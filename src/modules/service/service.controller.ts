import { BaseQuery } from '@common/base/query.base';
import { paginated } from '@common/types';
import { OWNER_ONLY } from '@modules/auth/roles';
import { CreateServiceDto } from '@modules/service/dto/create-service.dto';
import { UpdateServiceDto } from '@modules/service/dto/update-service.dto';
import { ServiceService } from '@modules/service/service.service';
import {
  Authorized,
  Body,
  Delete,
  Get,
  HttpCode,
  JsonController,
  Param,
  Patch,
  Post,
  QueryParams,
} from 'routing-controllers';
import { Service } from 'typedi';

@Service()
@JsonController('/services')
export class ServiceController {
  constructor(private readonly catalog: ServiceService) {}

  // Any tenant member may read; only owners mutate the catalog.
  @Get()
  @Authorized()
  async list(@QueryParams() query: BaseQuery) {
    const [items, total] = await this.catalog.list(query);
    return paginated(items, query.page, query.limit, total);
  }

  @Get('/:id')
  @Authorized()
  get(@Param('id') id: string) {
    return this.catalog.getById(id);
  }

  @Post()
  @HttpCode(201)
  @Authorized(OWNER_ONLY)
  create(@Body() dto: CreateServiceDto) {
    return this.catalog.create(dto);
  }

  @Patch('/:id')
  @Authorized(OWNER_ONLY)
  update(@Param('id') id: string, @Body() dto: UpdateServiceDto) {
    return this.catalog.update(id, dto);
  }

  @Delete('/:id')
  @Authorized(OWNER_ONLY)
  async remove(@Param('id') id: string) {
    await this.catalog.remove(id);
    return { success: true };
  }
}
