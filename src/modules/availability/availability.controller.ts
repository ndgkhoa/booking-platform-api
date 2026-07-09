import { AvailabilityService } from '@modules/availability/availability.service';
import { AvailabilityQuery } from '@modules/availability/dto/availability-query.dto';
import { Authorized, Get, JsonController, QueryParams } from 'routing-controllers';
import { Service } from 'typedi';

@Service()
@JsonController('/availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get()
  @Authorized()
  compute(@QueryParams() query: AvailabilityQuery) {
    return this.availability.compute(query);
  }
}
