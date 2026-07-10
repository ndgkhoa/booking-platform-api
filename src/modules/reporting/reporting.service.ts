import { BadRequestException } from '@common/exceptions';
import { getTenantId } from '@common/tenant/tenant-context';
import type { ReportQuery } from '@modules/reporting/dto/report-query.dto';
import {
  type BookingBucketRow,
  type ReportFilters,
  ReportingRepository,
  type RevenueBucketRow,
} from '@modules/reporting/reporting.repository';
import { TenantService } from '@modules/tenant/tenant.service';
import { Service } from 'typedi';

const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000; // one year

@Service()
export class ReportingService {
  constructor(
    private readonly reporting: ReportingRepository,
    private readonly tenants: TenantService,
  ) {}

  bookings(query: ReportQuery): Promise<BookingBucketRow[]> {
    return this.run(query, (f) => this.reporting.bookings(query.groupBy, f));
  }

  revenue(query: ReportQuery): Promise<RevenueBucketRow[]> {
    return this.run(query, (f) => this.reporting.revenue(query.groupBy, f));
  }

  private async run<T>(query: ReportQuery, exec: (f: ReportFilters) => Promise<T>): Promise<T> {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (to.getTime() <= from.getTime()) {
      throw new BadRequestException('`to` must be after `from`');
    }
    if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
      throw new BadRequestException('Report range must not exceed one year');
    }
    const { timezone } = await this.tenants.getById(getTenantId());
    return exec({ from, to, timezone, staffId: query.staffId, serviceId: query.serviceId });
  }
}
