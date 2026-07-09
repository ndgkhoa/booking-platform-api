import { getTenantId } from '@common/tenant/tenant-context';
import type { AvailabilityQuery } from '@modules/availability/dto/availability-query.dto';
import { localMinutesToUtc, weekdayInZone } from '@modules/availability/local-time';
import { generateSlots, type MsInterval } from '@modules/availability/slot-generator';
import { BookingService } from '@modules/booking/booking.service';
import { ServiceService } from '@modules/service/service.service';
import { StaffService } from '@modules/staff/staff.service';
import { StaffServiceService } from '@modules/staff-service/staff-service.service';
import { TenantService } from '@modules/tenant/tenant.service';
import { TimeOffService } from '@modules/time-off/time-off.service';
import { WorkingHoursService } from '@modules/working-hours/working-hours.service';
import { Service } from 'typedi';

const MINUTE_MS = 60_000;
const DAY_MINUTES = 24 * 60;

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

  async compute(query: AvailabilityQuery): Promise<AvailabilitySlot[]> {
    const service = await this.services.getById(query.serviceId);
    const zone = (await this.tenants.getById(getTenantId())).timezone;
    const weekday = weekdayInZone(query.date, zone);
    const durationMs = service.durationMin * MINUTE_MS;
    const bufferMs = (service.bufferBeforeMin + service.bufferAfterMin) * MINUTE_MS;

    const staffIds = query.staffId
      ? [query.staffId]
      : await this.capabilities.capableStaffIds(query.serviceId);

    const dayStart = localMinutesToUtc(query.date, 0, zone);
    const dayEnd = localMinutesToUtc(query.date, DAY_MINUTES, zone);

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

      const blockers = await this.buildBlockers(staffId, dayStart, dayEnd, bufferMs);
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

  /** Time-off (as-is) + existing bookings expanded by the service's buffers. */
  private async buildBlockers(
    staffId: string,
    dayStart: Date,
    dayEnd: Date,
    bufferMs: number,
  ): Promise<MsInterval[]> {
    const timeOffs = (await this.timeOff.list(staffId)).filter(
      (t) => t.startsAt < dayEnd && dayStart < t.endsAt,
    );
    const bookings = await this.bookings.activeForStaffBetween(staffId, dayStart, dayEnd);
    return [
      ...timeOffs.map((t) => ({ start: t.startsAt.getTime(), end: t.endsAt.getTime() })),
      ...bookings.map((b) => ({
        start: b.startsAt.getTime() - bufferMs,
        end: b.endsAt.getTime() + bufferMs,
      })),
    ];
  }
}
