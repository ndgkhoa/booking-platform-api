import { BaseQuery } from '@common/base/query.base';
import { OWNER_ONLY, paginated } from '@common/types';
import { CreateStaffDto } from '@modules/staff/dto/create-staff.dto';
import { UpdateStaffDto } from '@modules/staff/dto/update-staff.dto';
import { StaffService } from '@modules/staff/staff.service';
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
@JsonController('/staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @Authorized()
  async list(@QueryParams() query: BaseQuery) {
    const [items, total] = await this.staff.list(query);
    return paginated(items, query.page, query.limit, total);
  }

  @Get('/:id')
  @Authorized()
  get(@Param('id') id: string) {
    return this.staff.getById(id);
  }

  @Post()
  @HttpCode(201)
  @Authorized(OWNER_ONLY)
  create(@Body() dto: CreateStaffDto) {
    return this.staff.create(dto);
  }

  @Patch('/:id')
  @Authorized(OWNER_ONLY)
  update(@Param('id') id: string, @Body() dto: UpdateStaffDto) {
    return this.staff.update(id, dto);
  }

  @Delete('/:id')
  @Authorized(OWNER_ONLY)
  async remove(@Param('id') id: string) {
    await this.staff.remove(id);
    return { success: true };
  }
}
