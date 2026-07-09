import { runWithTenant } from '@common/tenant/tenant-context';
import { logger } from '@config/logger';
import { TokenService } from '@modules/auth/token.service';
import type { NextFunction, Request, Response } from 'express';
import { type ExpressMiddlewareInterface, Middleware } from 'routing-controllers';
import { Service } from 'typedi';
import { DataSource } from 'typeorm';

/**
 * Establishes tenant context from the bearer token BEFORE the action pipeline.
 *
 * For a tenant-scoped token it opens a transaction and pins the connection to
 * the tenant via `SET LOCAL app.tenant_id`, so Postgres RLS enforces isolation
 * on every statement (defence in depth over the app-layer filter). The commit
 * happens in `TenantTransactionInterceptor` — before the response is serialised,
 * so a commit failure surfaces as a 500 rather than a lie to the client. This
 * middleware only rolls back as a safety net (error, auth failure, abort).
 *
 * Trade-off: a tenant request holds one pooled connection with an open
 * transaction for the handler's duration — the pool is bounded and DB-side
 * statement/idle timeouts cap the hold (see data-source.ts).
 */
@Service()
@Middleware({ type: 'before' })
export class TenantContextMiddleware implements ExpressMiddlewareInterface {
  constructor(
    private readonly tokens: TokenService,
    private readonly dataSource: DataSource,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      next();
      return;
    }

    let tenantId: string | undefined;
    try {
      const claims = this.tokens.verify(token);
      req.tokenClaims = { tenantId: claims.tenantId, role: claims.role };
      tenantId = claims.tenantId;
    } catch {
      next();
      return;
    }

    if (!tenantId) {
      next();
      return;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();
      await queryRunner.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    } catch (error) {
      await queryRunner.release();
      next(error as Error);
      return;
    }

    req.tenantTx = queryRunner;
    const rollback = async (): Promise<void> => {
      if (req.tenantTxSettled) return;
      req.tenantTxSettled = true;
      try {
        await queryRunner.rollbackTransaction();
      } catch (error) {
        logger.error(`Tenant transaction rollback failed: ${(error as Error).message}`);
      } finally {
        await queryRunner.release();
      }
    };
    res.on('finish', () => void rollback());
    res.on('close', () => void rollback());

    runWithTenant({ tenantId, manager: queryRunner.manager }, () => next());
  }
}
