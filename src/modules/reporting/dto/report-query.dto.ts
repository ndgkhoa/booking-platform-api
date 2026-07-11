import { IsIn, IsISO8601, IsOptional, IsUUID } from 'class-validator';

export type ReportGroupBy = 'day' | 'week' | 'month' | 'service' | 'staff';

export class ReportQueryDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsIn(['day', 'week', 'month', 'service', 'staff'])
  groupBy!: ReportGroupBy;

  @IsOptional()
  @IsUUID()
  staffId?: string;

  @IsOptional()
  @IsUUID()
  serviceId?: string;
}
