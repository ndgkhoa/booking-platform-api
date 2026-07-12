import { REPORT_MAX_RANGE_MS } from '@common/constants';
import { ValidationException } from '@common/exceptions';
import { getTenantId } from '@common/tenant/tenant-context';
import type { ReportQueryDto } from '@modules/reporting/dto/report-query.dto';
import {
  type BookingBucketRow,
  type ReportFilters,
  ReportingRepository,
  type RevenueBucketRow,
} from '@modules/reporting/reporting.repository';
import { TenantService } from '@modules/tenant/tenant.service';
import { Service } from 'typedi';

@Service()
export class ReportingService {
  constructor(
    private readonly reporting: ReportingRepository,
    private readonly tenants: TenantService,
  ) {}

  bookings(query: ReportQueryDto): Promise<BookingBucketRow[]> {
    return this.run(query, (f) => this.reporting.bookings(query.groupBy, f));
  }

  revenue(query: ReportQueryDto): Promise<RevenueBucketRow[]> {
    return this.run(query, (f) => this.reporting.revenue(query.groupBy, f));
  }

  private async run<T>(query: ReportQueryDto, exec: (f: ReportFilters) => Promise<T>): Promise<T> {
    // Validate the span with plain UTC parsing; the actual bucketing/filtering
    // interprets the raw dates in the tenant timezone (see the repository).
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (to.getTime() <= from.getTime()) {
      throw new ValidationException('`to` must be after `from`');
    }
    if (to.getTime() - from.getTime() > REPORT_MAX_RANGE_MS) {
      throw new ValidationException('Report range must not exceed one year');
    }
    const { timezone } = await this.tenants.getById(getTenantId());
    return exec({
      from: query.from,
      to: query.to,
      timezone,
      staffId: query.staffId,
      serviceId: query.serviceId,
    });
  }
}
