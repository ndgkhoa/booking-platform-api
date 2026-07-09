import { OWNER_ONLY } from '@modules/auth/roles';
import { CreateWorkingHoursDto } from '@modules/working-hours/dto/create-working-hours.dto';
import { WorkingHoursService } from '@modules/working-hours/working-hours.service';
import {
  Authorized,
  Body,
  Delete,
  Get,
  HttpCode,
  JsonController,
  Param,
  Post,
} from 'routing-controllers';
import { Service } from 'typedi';

@Service()
@JsonController('/staff/:staffId/working-hours')
export class WorkingHoursController {
  constructor(private readonly hours: WorkingHoursService) {}

  @Get()
  @Authorized()
  list(@Param('staffId') staffId: string) {
    return this.hours.list(staffId);
  }

  @Post()
  @HttpCode(201)
  @Authorized(OWNER_ONLY)
  create(@Param('staffId') staffId: string, @Body() dto: CreateWorkingHoursDto) {
    return this.hours.create(staffId, dto);
  }

  @Delete('/:id')
  @Authorized(OWNER_ONLY)
  async remove(@Param('id') id: string) {
    await this.hours.remove(id);
    return { success: true };
  }
}
