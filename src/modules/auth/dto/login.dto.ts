import { IsEmail, IsString } from 'class-validator';

/** Payload for `POST /auth/login`. */
export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}
