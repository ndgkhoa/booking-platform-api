import { IsIn, IsUUID } from 'class-validator';

export class SubscribeDto {
  @IsUUID()
  planId!: string;

  @IsIn(['sepay', 'stripe'])
  provider!: 'sepay' | 'stripe';
}
