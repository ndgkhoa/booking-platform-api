import type { MembershipRole } from '@modules/membership/membership.entity';
import { IsEmail, IsIn } from 'class-validator';

export class CreateInviteDto {
  @IsEmail()
  email!: string;

  @IsIn(['owner', 'staff'])
  role!: MembershipRole;
}
