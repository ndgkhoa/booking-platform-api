import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTimeOffDto {
  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
