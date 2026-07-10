import { getTenantId, getTenantManager } from '@common/tenant/tenant-context';
import { Booking } from '@modules/booking/booking.entity';
import type { ReportGroupBy } from '@modules/reporting/dto/report-query.dto';
import { Service } from 'typedi';
import { DataSource, type EntityManager, type SelectQueryBuilder } from 'typeorm';

export interface ReportFilters {
  from: Date;
  to: Date;
  timezone: string;
  staffId?: string;
  serviceId?: string;
}

export interface BookingBucketRow {
  bucket: string;
  total: number;
  pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  no_show: number;
}

export interface RevenueBucketRow {
  bucket: string;
  amount: number;
  currency: string | null;
}

/** Statuses whose price snapshot counts toward earned revenue (service delivered). */
const REVENUE_STATUSES = ['completed'];

@Service()
export class ReportingRepository {
  constructor(private readonly dataSource: DataSource) {}

  /** Bookings grouped by the chosen dimension, with a per-status breakdown. */
  async bookings(groupBy: ReportGroupBy, filters: ReportFilters): Promise<BookingBucketRow[]> {
    const qb = this.baseQuery(filters)
      .addSelect(this.bucketExpr(groupBy), 'bucket')
      .addSelect('COUNT(*)', 'total')
      .addSelect(`COUNT(*) FILTER (WHERE b.status = 'pending')`, 'pending')
      .addSelect(`COUNT(*) FILTER (WHERE b.status = 'confirmed')`, 'confirmed')
      .addSelect(`COUNT(*) FILTER (WHERE b.status = 'completed')`, 'completed')
      .addSelect(`COUNT(*) FILTER (WHERE b.status = 'cancelled')`, 'cancelled')
      .addSelect(`COUNT(*) FILTER (WHERE b.status = 'no_show')`, 'no_show')
      .groupBy('bucket')
      .orderBy('bucket', 'ASC');
    const rows = await qb.getRawMany<Record<string, string>>();
    return rows.map((r) => ({
      bucket: String(r.bucket),
      total: Number(r.total),
      pending: Number(r.pending),
      confirmed: Number(r.confirmed),
      completed: Number(r.completed),
      cancelled: Number(r.cancelled),
      no_show: Number(r.no_show),
    }));
  }

  /** Summed price snapshot (integer minor units) for revenue-counted statuses. */
  async revenue(groupBy: ReportGroupBy, filters: ReportFilters): Promise<RevenueBucketRow[]> {
    const rows = await this.baseQuery(filters)
      .andWhere('b.status IN (:...statuses)', { statuses: REVENUE_STATUSES })
      .addSelect(this.bucketExpr(groupBy), 'bucket')
      .addSelect('COALESCE(SUM(b.price_amount), 0)', 'amount')
      .addSelect('MAX(b.price_currency)', 'currency')
      .groupBy('bucket')
      .orderBy('bucket', 'ASC')
      .getRawMany<Record<string, string>>();
    return rows.map((r) => ({
      bucket: String(r.bucket),
      amount: Number(r.amount),
      currency: r.currency ?? null,
    }));
  }

  /** Tenant-scoped, date-bounded query base (RLS is the backstop; app filter here). */
  private baseQuery(filters: ReportFilters): SelectQueryBuilder<Booking> {
    const manager: EntityManager = getTenantManager() ?? this.dataSource.manager;
    const qb = manager
      .getRepository(Booking)
      .createQueryBuilder('b')
      .where('b.tenant_id = :tenantId', { tenantId: getTenantId() })
      .andWhere('b.deleted_at IS NULL')
      .andWhere('b.starts_at >= :from AND b.starts_at < :to', {
        from: filters.from,
        to: filters.to,
      })
      .setParameter('tz', filters.timezone);
    if (filters.staffId) qb.andWhere('b.staff_id = :staffId', { staffId: filters.staffId });
    if (filters.serviceId)
      qb.andWhere('b.service_id = :serviceId', { serviceId: filters.serviceId });
    return qb.select([]);
  }

  /** Bucket key: a tenant-local truncated date for time groups, or the entity id. */
  private bucketExpr(groupBy: ReportGroupBy): string {
    switch (groupBy) {
      case 'service':
        return 'b.service_id::text';
      case 'staff':
        return 'b.staff_id::text';
      default:
        // Truncate in the tenant timezone so day/week/month align to local calendar (DST-aware).
        return `to_char(date_trunc('${groupBy}', b.starts_at AT TIME ZONE :tz), 'YYYY-MM-DD')`;
    }
  }
}
