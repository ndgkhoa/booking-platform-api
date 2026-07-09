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
 * For a tenant-scoped token it opens a per-request transaction and pins the
 * connection to the tenant via `SET LOCAL app.tenant_id`, so Postgres RLS
 * enforces isolation on every statement (defence in depth over the app-layer
 * filter). The transaction commits on a successful response and rolls back on a
 * 4xx/5xx or an aborted request — this also gives request-wide write atomicity.
 *
 * Trade-off: a tenant request holds one pooled connection for its whole
 * lifetime, and the commit lands as the response flushes. Operations needing a
 * guaranteed pre-response commit should use `runInTenantContext` directly.
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
    await queryRunner.connect();
    await queryRunner.startTransaction();
    await queryRunner.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);

    let settled = false;
    const settle = async (commit: boolean): Promise<void> => {
      if (settled) return;
      settled = true;
      try {
        if (commit) {
          await queryRunner.commitTransaction();
        } else {
          await queryRunner.rollbackTransaction();
        }
      } catch (error) {
        logger.error(`Tenant transaction settle failed: ${(error as Error).message}`);
      } finally {
        await queryRunner.release();
      }
    };
    res.on('finish', () => void settle(res.statusCode < 400));
    res.on('close', () => void settle(false));

    runWithTenant({ tenantId, manager: queryRunner.manager }, () => next());
  }
}
