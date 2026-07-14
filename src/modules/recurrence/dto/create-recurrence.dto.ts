import type { RecurrenceFreq } from '@modules/recurrence/domain/recurrence-expander';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateRecurrenceDto {
  @IsUUID()
  staffId!: string;

  @IsUUID()
  serviceId!: string;

  @IsUUID()
  customerId!: string;

  @IsIn(['daily', 'weekly'])
  freq!: RecurrenceFreq;

  @IsInt()
  @Min(1)
  @Max(52)
  interval!: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays?: number[];

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must be YYYY-MM-DD' })
  startDate!: string;

  @IsInt()
  @Min(0)
  @Max(1439)
  startMinutes!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  count?: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'until must be YYYY-MM-DD' })
  until?: string;

  @IsOptional()
  @IsIn(['skip_conflicts', 'all_or_nothing'])
  conflictPolicy?: 'skip_conflicts' | 'all_or_nothing';
}
