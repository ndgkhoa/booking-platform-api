import { OWNER_ONLY } from '@modules/auth/roles';
import { ReportQueryDto } from '@modules/reporting/dto/report-query.dto';
import { ReportingService } from '@modules/reporting/reporting.service';
import { Authorized, Get, JsonController, QueryParams } from 'routing-controllers';
import { Service } from 'typedi';

@Service()
@JsonController('/reports')
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @Get('/bookings')
  @Authorized(OWNER_ONLY)
  bookings(@QueryParams() query: ReportQueryDto) {
    return this.reporting.bookings(query);
  }

  @Get('/revenue')
  @Authorized(OWNER_ONLY)
  revenue(@QueryParams() query: ReportQueryDto) {
    return this.reporting.revenue(query);
  }
}
