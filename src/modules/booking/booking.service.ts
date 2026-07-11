import {
  AppException,
  BadRequestException,
  NotFoundException,
  PreconditionFailedException,
  UnprocessableStateException,
} from '@common/exceptions';
import { IdempotencyService } from '@common/idempotency/idempotency.service';
import type { Booking } from '@modules/booking/booking.entity';
import { BookingRepository } from '@modules/booking/booking.repository';
import { assertCanTransition } from '@modules/booking/booking-state-machine';
import { ACTIVE_BOOKING_STATUSES, BookingStatus } from '@modules/booking/booking-status';
import type { CreateBookingDto } from '@modules/booking/dto/create-booking.dto';
import type { RescheduleBookingDto } from '@modules/booking/dto/reschedule-booking.dto';
import { CustomerService } from '@modules/customer/customer.service';
import { OutboxRepository } from '@modules/outbox/outbox.repository';
import { ServiceService } from '@modules/service/service.service';
import { StaffServiceService } from '@modules/staff-service/staff-service.service';
import { Service } from 'typedi';

const MINUTE_MS = 60_000;

export interface OccurrenceSpec {
  staffId: string;
  serviceId: string;
  customerId: string;
  startsAt: Date;
  endsAt: Date;
  priceAmount: number;
  priceCurrency: string;
}

@Service()
export class BookingService {
  constructor(
    private readonly bookings: BookingRepository,
    private readonly services: ServiceService,
    private readonly capabilities: StaffServiceService,
    private readonly customers: CustomerService,
    private readonly idempotency: IdempotencyService,
    private readonly outbox: OutboxRepository,
  ) {}

  /** Emits a booking event on the current transaction — atomic with the change. */
  private emit(booking: Booking, eventType: string): Promise<unknown> {
    return this.outbox.record({
      aggregateType: 'booking',
      aggregateId: booking.id,
      eventType,
      payload: {
        bookingId: booking.id,
        staffId: booking.staffId,
        serviceId: booking.serviceId,
        customerId: booking.customerId,
        startsAt: booking.startsAt.toISOString(),
        status: booking.status,
      },
    });
  }

  /** Creates a booking, deduplicated by an optional Idempotency-Key. */
  create(dto: CreateBookingDto, idempotencyKey?: string): Promise<Booking> {
    return this.idempotency.run(idempotencyKey, dto, () => this.doCreate(dto));
  }

  private async doCreate(dto: CreateBookingDto): Promise<Booking> {
    const service = await this.services.getById(dto.serviceId); // 404 if missing in tenant
    if (!(await this.capabilities.canPerform(dto.staffId, dto.serviceId))) {
      throw new BadRequestException('This staff member cannot perform the selected service');
    }
    await this.customers.getById(dto.customerId); // 404 if the customer isn't in this tenant

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(startsAt.getTime() + service.durationMin * MINUTE_MS);

    // Price is snapshotted from the service at booking time.
    const booking = await this.bookings.create({
      staffId: dto.staffId,
      serviceId: dto.serviceId,
      customerId: dto.customerId,
      startsAt,
      endsAt,
      status: BookingStatus.Pending,
      priceAmount: service.priceAmount,
      priceCurrency: service.priceCurrency,
    });
    await this.emit(booking, 'booking.created');
    return booking;
  }

  getById(id: string): Promise<Booking> {
    return this.getOrThrow(id);
  }

  /**
   * Inserts one recurrence occurrence (pre-validated by the caller) on the
   * current transaction and emits its event. Throws the mapped 409 on slot
   * conflict — the caller decides skip vs abort.
   */
  async createOccurrence(spec: OccurrenceSpec, recurrenceId: string): Promise<Booking> {
    const booking = await this.bookings.create({
      staffId: spec.staffId,
      serviceId: spec.serviceId,
      customerId: spec.customerId,
      startsAt: spec.startsAt,
      endsAt: spec.endsAt,
      status: BookingStatus.Pending,
      priceAmount: spec.priceAmount,
      priceCurrency: spec.priceCurrency,
      recurrenceId,
    });
    await this.emit(booking, 'booking.created');
    return booking;
  }

  /** True if the error is the EXCLUDE slot conflict (409 BOOKING_SLOT_TAKEN). */
  isSlotTaken(error: unknown): boolean {
    return error instanceof AppException && error.errorCode === 'BOOKING_SLOT_TAKEN';
  }

  /** Cancels future occurrences of a series and emits a cancelled event for each. */
  async cancelSeries(recurrenceId: string): Promise<number> {
    const ids = await this.bookings.cancelFutureSeries(recurrenceId, new Date());
    for (const id of ids) {
      const booking = await this.getOrThrow(id);
      await this.emit(booking, 'booking.cancelled');
    }
    return ids.length;
  }

  activeForStaffBetween(staffId: string, from: Date, to: Date): Promise<Booking[]> {
    return this.bookings.findActiveForStaffBetween(staffId, from, to);
  }

  confirm(id: string, version: number): Promise<Booking> {
    return this.transition(id, version, BookingStatus.Confirmed);
  }

  complete(id: string, version: number): Promise<Booking> {
    return this.transition(id, version, BookingStatus.Completed);
  }

  cancel(id: string, version: number): Promise<Booking> {
    return this.transition(id, version, BookingStatus.Cancelled);
  }

  noShow(id: string, version: number): Promise<Booking> {
    return this.transition(id, version, BookingStatus.NoShow);
  }

  /** `ifMatchVersion` (from the If-Match header) takes precedence and maps a
   *  mismatch to 412; otherwise the body version maps a mismatch to 409. */
  async reschedule(
    id: string,
    dto: RescheduleBookingDto,
    ifMatchVersion?: number,
  ): Promise<Booking> {
    const version = ifMatchVersion ?? dto.version;
    if (version == null) {
      throw new BadRequestException('A version is required, via the If-Match header or the body');
    }
    const booking = await this.getOrThrow(id);
    if (!ACTIVE_BOOKING_STATUSES.includes(booking.status)) {
      throw new UnprocessableStateException('Only active bookings can be rescheduled');
    }
    const service = await this.services.getById(booking.serviceId);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(startsAt.getTime() + service.durationMin * MINUTE_MS);

    const applied = await this.bookings.applyReschedule(id, version, startsAt, endsAt);
    if (!applied) {
      throw ifMatchVersion != null
        ? new PreconditionFailedException('Booking version does not match If-Match')
        : this.staleError();
    }
    const updated = await this.getOrThrow(id);
    await this.emit(updated, 'booking.rescheduled');
    return updated;
  }

  private async transition(id: string, version: number, to: BookingStatus): Promise<Booking> {
    const booking = await this.getOrThrow(id);
    assertCanTransition(booking.status, to);
    const applied = await this.bookings.applyStatus(id, version, to);
    if (!applied) {
      throw this.staleError();
    }
    const updated = await this.getOrThrow(id);
    await this.emit(updated, `booking.${to}`);
    return updated;
  }

  private async getOrThrow(id: string): Promise<Booking> {
    const booking = await this.bookings.findById(id);
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    return booking;
  }

  private staleError(): AppException {
    return new AppException(
      409,
      'STALE_BOOKING',
      'Booking was modified concurrently; reload and retry',
    );
  }
}
