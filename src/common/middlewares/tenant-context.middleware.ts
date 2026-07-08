import { runWithTenant } from '@common/tenant/tenant-context';
import { TokenService } from '@modules/auth/token.service';
import type { NextFunction, Request, Response } from 'express';
import { type ExpressMiddlewareInterface, Middleware } from 'routing-controllers';
import { Service } from 'typedi';

/**
 * Establishes tenant context from the bearer token BEFORE the action pipeline,
 * so authorization and repositories can read it. Runs for every request; a
 * missing or invalid token just leaves the context unset — public routes still
 * work, and `@Authorized` routes are rejected later by the auth gate.
 */
@Service()
@Middleware({ type: 'before' })
export class TenantContextMiddleware implements ExpressMiddlewareInterface {
  constructor(private readonly tokens: TokenService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      next();
      return;
    }

    let claims: ReturnType<TokenService['verify']>;
    try {
      claims = this.tokens.verify(token);
    } catch {
      next();
      return;
    }

    req.tokenClaims = { tenantId: claims.tenantId, role: claims.role };
    if (claims.tenantId) {
      runWithTenant({ tenantId: claims.tenantId }, () => next());
      return;
    }
    next();
  }
}
