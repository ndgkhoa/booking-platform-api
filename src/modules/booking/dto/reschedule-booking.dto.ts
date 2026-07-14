import { IsInt, IsISO8601, IsOptional, Min } from 'class-validator';

export class RescheduleBookingDto {
  // Optional when the concurrency token is supplied via the `If-Match` header.
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;

  @IsISO8601()
  startsAt!: string;
}
