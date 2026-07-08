import type { MembershipRole } from '@modules/membership/membership.entity';
import type { User as AppUser } from '@modules/user/user.entity';

declare global {
  namespace Express {
    interface User extends AppUser {}
    interface Request {
      // Active-session claims decoded from the bearer token by TenantContextMiddleware.
      tokenClaims?: { tenantId?: string; role?: MembershipRole };
    }
  }
}
