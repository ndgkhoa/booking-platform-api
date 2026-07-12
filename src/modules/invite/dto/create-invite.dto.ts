import { MembershipRole } from '@common/types/enums/membership-role';
import { IsEmail, IsIn } from 'class-validator';

export class CreateInviteDto {
  @IsEmail()
  email!: string;

  @IsIn(Object.values(MembershipRole))
  role!: MembershipRole;
}
