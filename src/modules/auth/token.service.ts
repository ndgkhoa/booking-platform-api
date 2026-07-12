import type { MembershipRole } from '@common/types';
import { env } from '@config/env';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { Service } from 'typedi';

/**
 * Token claims. `tenantId`/`role` describe the session's active tenant and are
 * absent for a user with no tenant yet (fresh signup before onboarding).
 */
export interface JwtPayload {
  sub: string;
  tenantId?: string;
  role?: MembershipRole;
}

@Service()
export class TokenService {
  sign(payload: JwtPayload): string {
    const options: SignOptions = {
      expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    };
    return jwt.sign(payload, env.JWT_SECRET, options);
  }

  verify(token: string): JwtPayload {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  }
}
