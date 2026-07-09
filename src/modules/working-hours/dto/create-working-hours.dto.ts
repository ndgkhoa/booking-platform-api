import { IsInt, Max, Min } from 'class-validator';

export class CreateWorkingHoursDto {
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @IsInt()
  @Min(0)
  @Max(1440)
  startMin!: number;

  @IsInt()
  @Min(0)
  @Max(1440)
  endMin!: number;
}
