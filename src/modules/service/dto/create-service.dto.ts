import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateServiceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsInt()
  @Min(1)
  @Max(1440)
  durationMin!: number;

  @IsInt()
  @Min(0)
  priceAmount!: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  priceCurrency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  bufferBeforeMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  bufferAfterMin?: number;
}
