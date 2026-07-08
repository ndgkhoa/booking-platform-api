import { env } from '@config/env';
import type { Role } from '@modules/tenant/role.enum';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { Service } from 'typedi';

const JWT_ALGORITHM = 'HS256' as const;

/** Claims carried by the short-lived access token. */
export interface AccessTokenPayload {
  sub: string;
  tenantId: string;
  role: Role;
}

@Service()
export class TokenService {
  signAccess(payload: AccessTokenPayload): string {
    const options: SignOptions = {
      algorithm: JWT_ALGORITHM,
      expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    };
    return jwt.sign(payload, env.JWT_SECRET, options);
  }

  verifyAccess(token: string): AccessTokenPayload {
    // Pin the algorithm so a forged token can't downgrade to `alg: none`.
    return jwt.verify(token, env.JWT_SECRET, { algorithms: [JWT_ALGORITHM] }) as AccessTokenPayload;
  }
}
