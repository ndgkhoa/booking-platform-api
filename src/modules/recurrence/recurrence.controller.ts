import { TENANT_MEMBER } from '@modules/auth/roles';
import { CreateRecurrenceDto } from '@modules/recurrence/dto/create-recurrence.dto';
import { RecurrenceService } from '@modules/recurrence/recurrence.service';
import { Authorized, Body, HttpCode, JsonController, Param, Post } from 'routing-controllers';
import { Service } from 'typedi';

@Service()
@JsonController('/recurrences')
export class RecurrenceController {
  constructor(private readonly recurrences: RecurrenceService) {}

  @Post()
  @HttpCode(201)
  @Authorized(TENANT_MEMBER)
  create(@Body() dto: CreateRecurrenceDto) {
    return this.recurrences.create(dto);
  }

  @Post('/:id/cancel')
  @Authorized(TENANT_MEMBER)
  async cancel(@Param('id') id: string) {
    const cancelled = await this.recurrences.cancelSeries(id);
    return { cancelled };
  }
}
