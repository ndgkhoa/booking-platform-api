import { BadRequestException, NotFoundException } from '@common/exceptions';
import { StaffService } from '@modules/staff/staff.service';
import type { CreateTimeOffDto } from '@modules/time-off/dto/create-time-off.dto';
import type { TimeOff } from '@modules/time-off/time-off.entity';
import { TimeOffRepository } from '@modules/time-off/time-off.repository';
import { Service } from 'typedi';

@Service()
export class TimeOffService {
  constructor(
    private readonly timeOff: TimeOffRepository,
    private readonly staff: StaffService,
  ) {}

  async create(staffId: string, dto: CreateTimeOffDto): Promise<TimeOff> {
    await this.staff.getById(staffId); // 404 if the staff is missing in this tenant
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException('endsAt must be after startsAt');
    }
    return this.timeOff.createOne({ staffId, startsAt, endsAt, reason: dto.reason ?? null });
  }

  list(staffId: string): Promise<TimeOff[]> {
    return this.timeOff.listForStaff(staffId);
  }

  overlapping(staffId: string, from: Date, to: Date): Promise<TimeOff[]> {
    return this.timeOff.overlapping(staffId, from, to);
  }

  async remove(id: string): Promise<void> {
    if (!(await this.timeOff.remove(id))) {
      throw new NotFoundException('Time-off not found');
    }
  }
}
