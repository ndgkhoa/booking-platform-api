import { runWithTenant } from '@common/context/tenant-context';
import { logger } from '@config/logger';
import { TokenService } from '@modules/auth/token.service';
import type { NextFunction, Request, Response } from 'express';
import { Container } from 'typedi';

/**
 * Opens the request-scoped tenant context from a valid access token so that
 * everything downstream — the authorization checker, tenant-scoped repositories
 * — runs inside the correct tenant scope. Requests without a (valid) token pass
 * through unscoped; the authorization checker still rejects protected routes.
 */
export function tenantContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }

  try {
    const payload = Container.get(TokenService).verifyAccess(header.slice('Bearer '.length));
    runWithTenant({ tenantId: payload.tenantId, userId: payload.sub, role: payload.role }, next);
  } catch (error) {
    // Fail open here (no context) — the authorization checker still rejects
    // protected routes. Log at debug so an expired/invalid token is diagnosable.
    logger.debug('Discarded invalid access token in tenant context', {
      reason: (error as Error).message,
    });
    next();
  }
}
