import { IsIn, IsISO8601, IsOptional, IsUUID } from 'class-validator';

export type ReportGroupBy = 'day' | 'week' | 'month' | 'service' | 'staff';

export class ReportQueryDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  // Typed `string`, not the ReportGroupBy union: routing-controllers JSON.parses query params reflected as Object, so a union type would 400. `@IsIn` still restricts the values.
  @IsIn(['day', 'week', 'month', 'service', 'staff'])
  groupBy!: string;

  @IsOptional()
  @IsUUID()
  staffId?: string;

  @IsOptional()
  @IsUUID()
  serviceId?: string;
}
