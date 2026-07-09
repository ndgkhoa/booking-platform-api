import {
  AppException,
  BadRequestException,
  NotFoundException,
  UnprocessableStateException,
} from '@common/exceptions';
import type { Booking } from '@modules/booking/booking.entity';
import { BookingRepository } from '@modules/booking/booking.repository';
import { assertCanTransition } from '@modules/booking/booking-state-machine';
import { ACTIVE_BOOKING_STATUSES, type BookingStatus } from '@modules/booking/booking-status';
import type { CreateBookingDto } from '@modules/booking/dto/create-booking.dto';
import type { RescheduleBookingDto } from '@modules/booking/dto/reschedule-booking.dto';
import { CustomerService } from '@modules/customer/customer.service';
import { ServiceService } from '@modules/service/service.service';
import { StaffServiceService } from '@modules/staff-service/staff-service.service';
import { Service } from 'typedi';

const MINUTE_MS = 60_000;

@Service()
export class BookingService {
  constructor(
    private readonly bookings: BookingRepository,
    private readonly services: ServiceService,
    private readonly capabilities: StaffServiceService,
    private readonly customers: CustomerService,
  ) {}

  async create(dto: CreateBookingDto): Promise<Booking> {
    const service = await this.services.getById(dto.serviceId); // 404 if missing in tenant
    if (!(await this.capabilities.canPerform(dto.staffId, dto.serviceId))) {
      throw new BadRequestException('This staff member cannot perform the selected service');
    }
    await this.customers.getById(dto.customerId); // 404 if the customer isn't in this tenant

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(startsAt.getTime() + service.durationMin * MINUTE_MS);

    // Price is snapshotted from the service at booking time.
    return this.bookings.create({
      staffId: dto.staffId,
      serviceId: dto.serviceId,
      customerId: dto.customerId,
      startsAt,
      endsAt,
      status: 'pending',
      priceAmount: service.priceAmount,
      priceCurrency: service.priceCurrency,
    });
  }

  getById(id: string): Promise<Booking> {
    return this.getOrThrow(id);
  }

  confirm(id: string, version: number): Promise<Booking> {
    return this.transition(id, version, 'confirmed');
  }

  complete(id: string, version: number): Promise<Booking> {
    return this.transition(id, version, 'completed');
  }

  cancel(id: string, version: number): Promise<Booking> {
    return this.transition(id, version, 'cancelled');
  }

  noShow(id: string, version: number): Promise<Booking> {
    return this.transition(id, version, 'no_show');
  }

  async reschedule(id: string, dto: RescheduleBookingDto): Promise<Booking> {
    const booking = await this.getOrThrow(id);
    if (!ACTIVE_BOOKING_STATUSES.includes(booking.status)) {
      throw new UnprocessableStateException('Only active bookings can be rescheduled');
    }
    const service = await this.services.getById(booking.serviceId);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(startsAt.getTime() + service.durationMin * MINUTE_MS);

    const applied = await this.bookings.applyReschedule(id, dto.version, startsAt, endsAt);
    if (!applied) {
      throw this.staleError();
    }
    return this.getOrThrow(id);
  }

  private async transition(id: string, version: number, to: BookingStatus): Promise<Booking> {
    const booking = await this.getOrThrow(id);
    assertCanTransition(booking.status, to);
    const applied = await this.bookings.applyStatus(id, version, to);
    if (!applied) {
      throw this.staleError();
    }
    return this.getOrThrow(id);
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
