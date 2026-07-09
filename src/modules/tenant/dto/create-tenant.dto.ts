import { IsOptional, IsTimeZone, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateTenantDto {
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug must be kebab-case' })
  @MinLength(2)
  @MaxLength(40)
  slug!: string;

  // IANA zone, validated up-front so availability never computes on a bad zone.
  @IsOptional()
  @IsTimeZone()
  timezone?: string;
}
