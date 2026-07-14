import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SuspendTenantDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
