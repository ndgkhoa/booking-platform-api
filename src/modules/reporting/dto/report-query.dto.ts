import { IsIn, IsISO8601, IsOptional, IsUUID } from 'class-validator';

export type ReportGroupBy = 'day' | 'week' | 'month' | 'service' | 'staff';

export class ReportQueryDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  // Typed `string` (not the ReportGroupBy union) on purpose: routing-controllers
  // JSON.parses query params whose reflected type isn't a primitive, and a union
  // alias reflects as Object — so `groupBy=day` would 400 with "cannot be parsed
  // into JSON". `@IsIn` still restricts it to the allowed values.
  @IsIn(['day', 'week', 'month', 'service', 'staff'])
  groupBy!: string;

  @IsOptional()
  @IsUUID()
  staffId?: string;

  @IsOptional()
  @IsUUID()
  serviceId?: string;
}
