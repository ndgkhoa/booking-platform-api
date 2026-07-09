import type { MembershipRole } from '@modules/membership/membership.entity';
import type { User as AppUser } from '@modules/user/user.entity';
import type { QueryRunner } from 'typeorm';

declare global {
  namespace Express {
    interface User extends AppUser {}
    interface Request {
      // Active-session claims decoded from the bearer token by TenantContextMiddleware.
      tokenClaims?: { tenantId?: string; role?: MembershipRole };
      // Per-request RLS transaction: opened by TenantContextMiddleware, committed
      // by TenantTransactionInterceptor on success, rolled back otherwise.
      tenantTx?: QueryRunner;
      tenantTxSettled?: boolean;
    }
  }
}
