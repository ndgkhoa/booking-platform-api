import { IsIn, IsUUID } from 'class-validator';

export class CreateSubscriptionDto {
  @IsUUID()
  planId!: string;

  @IsIn(['sepay', 'stripe'])
  provider!: 'sepay' | 'stripe';
}
