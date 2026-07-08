import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug must be kebab-case' })
  @MinLength(2)
  @MaxLength(40)
  slug!: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}
