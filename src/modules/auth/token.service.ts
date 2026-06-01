import { env } from '@config/env';
import type { User } from '@modules/user/user.entity';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { Service } from 'typedi';

export interface JwtPayload {
  sub: string;
  roles: string[];
}

@Service()
export class TokenService {
  sign(user: Pick<User, 'id' | 'roles'>): string {
    const payload: JwtPayload = { sub: user.id, roles: user.roles };
    const options: SignOptions = {
      expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    };
    return jwt.sign(payload, env.JWT_SECRET, options);
  }

  verify(token: string): JwtPayload {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  }
}
