import { IsInt, IsISO8601, Min } from 'class-validator';

export class RescheduleBookingDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsISO8601()
  startsAt!: string;
}
