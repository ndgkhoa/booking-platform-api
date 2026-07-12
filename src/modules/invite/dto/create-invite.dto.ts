import { MembershipRole } from '@common/types';
import { IsEmail, IsIn } from 'class-validator';

export class CreateInviteDto {
  @IsEmail()
  email!: string;

  @IsIn(Object.values(MembershipRole))
  role!: MembershipRole;
}
