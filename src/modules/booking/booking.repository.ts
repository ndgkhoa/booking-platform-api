import { BaseTenantRepository } from '@common/base/tenant-repository.base';
import { AppException } from '@common/exceptions';
import { getTenantId } from '@common/tenant/tenant-context';
import { Booking } from '@modules/booking/booking.entity';
import { ACTIVE_BOOKING_STATUSES, type BookingStatus } from '@modules/booking/booking-status';
import { Service } from 'typedi';
import { DataSource, In, LessThan, MoreThan } from 'typeorm';

@Service()
export class BookingRepository extends BaseTenantRepository<Booking> {
  constructor(dataSource: DataSource) {
    super(dataSource, Booking);
  }

  /** Inserts a booking; the EXCLUDE constraint (23P01) means the slot is taken. */
  async create(data: Partial<Booking>): Promise<Booking> {
    try {
      return await this.persist(data);
    } catch (error) {
      throw this.mapSlotConflict(error);
    }
  }

  findById(id: string): Promise<Booking | null> {
    return this.findOne({ where: { id } });
  }

  /** Active bookings for a staff overlapping [from, to) — for availability. */
  findActiveForStaffBetween(staffId: string, from: Date, to: Date): Promise<Booking[]> {
    return this.findMany({
      where: {
        staffId,
        status: In([...ACTIVE_BOOKING_STATUSES]),
        startsAt: LessThan(to),
        endsAt: MoreThan(from),
      },
    });
  }

  /** Optimistic status change: succeeds only if the version still matches. */
  async applyStatus(id: string, version: number, status: BookingStatus): Promise<boolean> {
    const result = await this.repo
      .createQueryBuilder()
      .update(Booking)
      .set({ status, version: () => '"version" + 1' })
      .where('id = :id AND tenant_id = :tenantId AND version = :version', {
        id,
        tenantId: getTenantId(),
        version,
      })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  /** Optimistic reschedule; re-checks the EXCLUDE constraint for the new range. */
  async applyReschedule(
    id: string,
    version: number,
    startsAt: Date,
    endsAt: Date,
  ): Promise<boolean> {
    try {
      const result = await this.repo
        .createQueryBuilder()
        .update(Booking)
        .set({ startsAt, endsAt, version: () => '"version" + 1' })
        .where('id = :id AND tenant_id = :tenantId AND version = :version', {
          id,
          tenantId: getTenantId(),
          version,
        })
        .execute();
      return (result.affected ?? 0) > 0;
    } catch (error) {
      throw this.mapSlotConflict(error);
    }
  }

  private mapSlotConflict(error: unknown): unknown {
    if ((error as { code?: string }).code === '23P01') {
      return new AppException(409, 'BOOKING_SLOT_TAKEN', 'This time slot is no longer available');
    }
    return error;
  }
}
