import { BaseQuery } from '@common/base/query.base';
import { paginated } from '@common/types/response';
import { CreateServiceDto } from '@modules/service/dto/create-service.dto';
import { UpdateServiceDto } from '@modules/service/dto/update-service.dto';
import { ServiceCatalog } from '@modules/service/service.service';
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
  constructor(private readonly catalog: ServiceCatalog) {}

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
  @Authorized(['owner'])
  create(@Body() dto: CreateServiceDto) {
    return this.catalog.create(dto);
  }

  @Patch('/:id')
  @Authorized(['owner'])
  update(@Param('id') id: string, @Body() dto: UpdateServiceDto) {
    return this.catalog.update(id, dto);
  }

  @Delete('/:id')
  @Authorized(['owner'])
  async remove(@Param('id') id: string) {
    await this.catalog.remove(id);
    return { success: true };
  }
}
