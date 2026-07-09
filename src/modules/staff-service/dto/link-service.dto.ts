import { IsUUID } from 'class-validator';

export class LinkServiceDto {
  @IsUUID()
  serviceId!: string;
}
