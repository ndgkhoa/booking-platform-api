import { BadRequestException, ConflictException, NotFoundException } from '@common/exceptions';
import { StaffService } from '@modules/staff/staff.service';
import type { CreateWorkingHoursDto } from '@modules/working-hours/dto/create-working-hours.dto';
import type { WorkingHours } from '@modules/working-hours/working-hours.entity';
import { WorkingHoursRepository } from '@modules/working-hours/working-hours.repository';
import { Service } from 'typedi';

@Service()
export class WorkingHoursService {
  constructor(
    private readonly hours: WorkingHoursRepository,
    private readonly staff: StaffService,
  ) {}

  async create(staffId: string, dto: CreateWorkingHoursDto): Promise<WorkingHours> {
    await this.staff.getById(staffId); // 404 if the staff is missing in this tenant
    if (dto.startMin >= dto.endMin) {
      throw new BadRequestException('startMin must be before endMin');
    }
    // Half-open intervals: overlap when start < other.end AND other.start < end.
    // The app check gives a friendly message; the DB EXCLUDE constraint (23P01)
    // is the race-proof backstop.
    const sameDay = await this.hours.findForStaffWeekday(staffId, dto.weekday);
    const overlaps = sameDay.some((h) => dto.startMin < h.endMin && h.startMin < dto.endMin);
    if (overlaps) {
      throw new ConflictException('Working hours overlap an existing interval');
    }
    try {
      return await this.hours.createOne({
        staffId,
        weekday: dto.weekday,
        startMin: dto.startMin,
        endMin: dto.endMin,
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23P01') {
        throw new ConflictException('Working hours overlap an existing interval');
      }
      throw error;
    }
  }

  list(staffId: string): Promise<WorkingHours[]> {
    return this.hours.listForStaff(staffId);
  }

  forStaffWeekday(staffId: string, weekday: number): Promise<WorkingHours[]> {
    return this.hours.findForStaffWeekday(staffId, weekday);
  }

  async remove(id: string): Promise<void> {
    if (!(await this.hours.remove(id))) {
      throw new NotFoundException('Working hours not found');
    }
  }
}
