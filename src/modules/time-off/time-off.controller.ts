import { CreateTimeOffDto } from '@modules/time-off/dto/create-time-off.dto';
import { TimeOffService } from '@modules/time-off/time-off.service';
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
@JsonController('/staff/:staffId/time-off')
export class TimeOffController {
  constructor(private readonly timeOff: TimeOffService) {}

  @Get()
  @Authorized()
  list(@Param('staffId') staffId: string) {
    return this.timeOff.list(staffId);
  }

  @Post()
  @HttpCode(201)
  @Authorized(['owner'])
  create(@Param('staffId') staffId: string, @Body() dto: CreateTimeOffDto) {
    return this.timeOff.create(staffId, dto);
  }

  @Delete('/:id')
  @Authorized(['owner'])
  async remove(@Param('id') id: string) {
    await this.timeOff.remove(id);
    return { success: true };
  }
}
