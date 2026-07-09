import { IsOptional, IsUUID, Matches } from 'class-validator';

export class AvailabilityQuery {
  @IsUUID()
  serviceId!: string;

  @IsOptional()
  @IsUUID()
  staffId?: string;

  /** Local calendar date (in the tenant's timezone). */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date!: string;
}
