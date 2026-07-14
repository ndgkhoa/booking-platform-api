import { MINUTE_MS } from '@common/constants';
import { BadRequestException } from '@common/exceptions';
import { getTenantId, getTenantManager } from '@common/tenant/tenant-context';
import { BookingService, type OccurrenceSpec } from '@modules/booking/booking.service';
import { CustomerService } from '@modules/customer/customer.service';
import { expandRecurrence } from '@modules/recurrence/domain/recurrence-expander';
import type { CreateRecurrenceDto } from '@modules/recurrence/dto/create-recurrence.dto';
import { RecurrenceRepository } from '@modules/recurrence/recurrence.repository';
import { ServiceService } from '@modules/service/service.service';
import { StaffServiceService } from '@modules/staff-service/staff-service.service';
import { TenantService } from '@modules/tenant/tenant.service';
import { Service } from 'typedi';

export interface RecurrenceResult {
  recurrenceId: string;
  created: string[]; // ISO start instants that became bookings
  skipped: string[]; // ISO start instants skipped due to conflicts
}

@Service()
export class RecurrenceService {
  constructor(
    private readonly recurrences: RecurrenceRepository,
    private readonly bookings: BookingService,
    private readonly services: ServiceService,
    private readonly capabilities: StaffServiceService,
    private readonly customers: CustomerService,
    private readonly tenants: TenantService,
  ) {}

  async create(dto: CreateRecurrenceDto): Promise<RecurrenceResult> {
    if (dto.freq === 'daily' && dto.weekdays?.length) {
      throw new BadRequestException('weekdays only applies to a weekly recurrence');
    }
    const service = await this.services.getById(dto.serviceId);
    if (!(await this.capabilities.canPerform(dto.staffId, dto.serviceId))) {
      throw new BadRequestException('This staff member cannot perform the selected service');
    }
    await this.customers.getById(dto.customerId);

    const { timezone } = await this.tenants.getById(getTenantId());
    const occurrences = expandRecurrence({
      freq: dto.freq,
      interval: dto.interval,
      weekdays: dto.weekdays,
      startDate: dto.startDate,
      startMinutes: dto.startMinutes,
      count: dto.count,
      until: dto.until,
      timezone,
    });
    if (occurrences.length === 0) {
      throw new BadRequestException('The recurrence rule produces no occurrences');
    }

    const recurrence = await this.recurrences.createOne({
      serviceId: dto.serviceId,
      staffId: dto.staffId,
      customerId: dto.customerId,
      freq: dto.freq,
      interval: dto.interval,
      weekdays: dto.weekdays ?? null,
      startDate: dto.startDate,
      startMinutes: dto.startMinutes,
      count: dto.count ?? null,
      until: dto.until ?? null,
      timezone,
    });

    const durationMs = service.durationMin * MINUTE_MS;
    const spec = (startsAt: Date): OccurrenceSpec => ({
      staffId: dto.staffId,
      serviceId: dto.serviceId,
      customerId: dto.customerId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + durationMs),
      priceAmount: service.priceAmount,
      priceCurrency: service.priceCurrency,
    });

    const policy = dto.conflictPolicy ?? 'skip_conflicts';
    const outcome =
      policy === 'all_or_nothing'
        ? await this.allOrNothing(occurrences, recurrence.id, spec)
        : await this.skipConflicts(occurrences, recurrence.id, spec);

    return { recurrenceId: recurrence.id, ...outcome };
  }

  cancelSeries(recurrenceId: string): Promise<number> {
    return this.bookings.cancelSeries(recurrenceId);
  }

  /** Any conflict aborts the whole series — let the 409 roll back the request tx. */
  private async allOrNothing(
    occurrences: Date[],
    recurrenceId: string,
    spec: (d: Date) => OccurrenceSpec,
  ): Promise<{ created: string[]; skipped: string[] }> {
    const created: string[] = [];
    for (const startsAt of occurrences) {
      await this.bookings.createOccurrence(spec(startsAt), recurrenceId);
      created.push(startsAt.toISOString());
    }
    return { created, skipped: [] };
  }

  /** Each occurrence runs inside its own SAVEPOINT so a slot conflict (23P01) rolls back and skips without poisoning the outer request transaction. */
  private async skipConflicts(
    occurrences: Date[],
    recurrenceId: string,
    spec: (d: Date) => OccurrenceSpec,
  ): Promise<{ created: string[]; skipped: string[] }> {
    const manager = getTenantManager();
    if (!manager) {
      throw new Error('Recurrence expansion must run inside a tenant transaction');
    }
    const created: string[] = [];
    const skipped: string[] = [];
    for (const [i, startsAt] of occurrences.entries()) {
      const sp = `occ_${i}`;
      await manager.query(`SAVEPOINT ${sp}`);
      try {
        await this.bookings.createOccurrence(spec(startsAt), recurrenceId);
        await manager.query(`RELEASE SAVEPOINT ${sp}`);
        created.push(startsAt.toISOString());
      } catch (error) {
        await manager.query(`ROLLBACK TO SAVEPOINT ${sp}`);
        if (!this.bookings.isSlotTaken(error)) throw error;
        skipped.push(startsAt.toISOString());
      }
    }
    return { created, skipped };
  }
}
