import { MINUTE_MS, MINUTES_PER_DAY } from '@common/constants';
import { BadRequestException } from '@common/exceptions';
import { getTenantId } from '@common/tenant/tenant-context';
import {
  isValidLocalDate,
  localMinutesToUtc,
  weekdayInZone,
} from '@modules/availability/domain/local-time';
import { generateSlots, type MsInterval } from '@modules/availability/domain/slot-generator';
import type { AvailabilityQueryDto } from '@modules/availability/dto/availability-query.dto';
import { BookingService } from '@modules/booking/booking.service';
import { ServiceService } from '@modules/service/service.service';
import { StaffService } from '@modules/staff/staff.service';
import { StaffServiceService } from '@modules/staff-service/staff-service.service';
import { TenantService } from '@modules/tenant/tenant.service';
import { TimeOffService } from '@modules/time-off/time-off.service';
import { WorkingHoursService } from '@modules/working-hours/working-hours.service';
import { Service } from 'typedi';

export interface AvailabilitySlot {
  staffId: string;
  startsAt: string;
  endsAt: string;
}

/**
 * Read model that aggregates working hours, time-off, existing bookings and
 * capability to produce bookable slots. Slots are computed in the tenant's
 * timezone (DST-safe) then returned as UTC instants. It intentionally depends on
 * several domain services because availability is a projection over all of them.
 */
@Service()
export class AvailabilityService {
  constructor(
    private readonly services: ServiceService,
    private readonly tenants: TenantService,
    private readonly staff: StaffService,
    private readonly capabilities: StaffServiceService,
    private readonly workingHours: WorkingHoursService,
    private readonly timeOff: TimeOffService,
    private readonly bookings: BookingService,
  ) {}

  async compute(query: AvailabilityQueryDto): Promise<AvailabilitySlot[]> {
    if (!isValidLocalDate(query.date)) {
      throw new BadRequestException('date is not a valid calendar date');
    }
    const service = await this.services.getById(query.serviceId);
    const zone = (await this.tenants.getById(getTenantId())).timezone;
    const weekday = weekdayInZone(query.date, zone);
    const durationMs = service.durationMin * MINUTE_MS;
    const bufferBeforeMs = service.bufferBeforeMin * MINUTE_MS;
    const bufferAfterMs = service.bufferAfterMin * MINUTE_MS;

    const staffIds = query.staffId
      ? [query.staffId]
      : await this.capabilities.capableStaffIds(query.serviceId);

    const dayStart = localMinutesToUtc(query.date, 0, zone);
    const dayEnd = localMinutesToUtc(query.date, MINUTES_PER_DAY, zone);

    const slots: AvailabilitySlot[] = [];
    for (const staffId of staffIds) {
      if (query.staffId && !(await this.capabilities.canPerform(staffId, query.serviceId))) {
        continue;
      }
      const staff = await this.staff.findById(staffId);
      if (!staff?.active) {
        continue;
      }

      const hours = await this.workingHours.forStaffWeekday(staffId, weekday);
      if (hours.length === 0) {
        continue;
      }

      const blockers = await this.buildBlockers(staffId, dayStart, dayEnd, {
        before: bufferBeforeMs,
        after: bufferAfterMs,
      });
      for (const window of hours) {
        const windowInterval: MsInterval = {
          start: localMinutesToUtc(query.date, window.startMin, zone).getTime(),
          end: localMinutesToUtc(query.date, window.endMin, zone).getTime(),
        };
        for (const slot of generateSlots(windowInterval, durationMs, blockers)) {
          slots.push({
            staffId,
            startsAt: new Date(slot.start).toISOString(),
            endsAt: new Date(slot.end).toISOString(),
          });
        }
      }
    }

    slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return slots;
  }

  /**
   * Time-off (as-is) + existing bookings padded by the queried service's buffers
   * on their correct sides (before at the start, after at the end). Simplification:
   * a booking's OWN service buffers aren't loaded; the queried service's buffers
   * proxy for the required gap. This only pre-filters UX — the EXCLUDE constraint
   * (which has no buffer) is the actual booking guarantee.
   */
  private async buildBlockers(
    staffId: string,
    dayStart: Date,
    dayEnd: Date,
    buffer: { before: number; after: number },
  ): Promise<MsInterval[]> {
    const timeOffs = (await this.timeOff.overlapping(staffId, dayStart, dayEnd)).map((t) => ({
      start: t.startsAt.getTime(),
      end: t.endsAt.getTime(),
    }));
    const bookings = await this.bookings.activeForStaffBetween(staffId, dayStart, dayEnd);
    return [
      ...timeOffs,
      ...bookings.map((b) => ({
        start: b.startsAt.getTime() - buffer.before,
        end: b.endsAt.getTime() + buffer.after,
      })),
    ];
  }
}
