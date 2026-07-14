import { IsISO8601, IsUUID } from 'class-validator';

export class CreateBookingDto {
  @IsUUID()
  staffId!: string;

  @IsUUID()
  serviceId!: string;

  @IsUUID()
  customerId!: string;

  @IsISO8601()
  startsAt!: string;
}
