import { ForbiddenException } from '@common/exceptions';
import { runWithTenant } from '@common/tenant/tenant-context';
import { TenantStatus } from '@common/types';
import { logger } from '@config/logger';
import { TokenService } from '@modules/auth/token.service';
import type { NextFunction, Request, Response } from 'express';
import { type ExpressMiddlewareInterface, Middleware } from 'routing-controllers';
import { Service } from 'typedi';
import { DataSource } from 'typeorm';

// Pins tenant via SET LOCAL app.tenant_id pre-pipeline for RLS defense-in-depth; commit
// happens in TenantTransactionInterceptor so failures surface as 500 — this middleware only
// rolls back as a safety net. Holds one pooled connection+tx per request (pool bounded, DB
// statement/idle timeouts cap the hold — see data-source.ts).
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
    let blocked: string | null = null;
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();
      await queryRunner.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
      // Blocks a suspended/vanished tenant before any handler runs; tenants table isn't
      // RLS-scoped, so this read is unaffected by the tenant setting above.
      const rows: Array<{ status: string }> = await queryRunner.query(
        'SELECT "status" FROM "tenants" WHERE "id" = $1 AND "deleted_at" IS NULL',
        [tenantId],
      );
      blocked =
        rows.length === 0
          ? 'Tenant not found'
          : rows[0]?.status === TenantStatus.Suspended
            ? 'Tenant is suspended'
            : null;
    } catch (error) {
      // Roll back before releasing — otherwise the pooled connection stays idle-in-transaction,
      // carrying this request's app.tenant_id to the next borrower.
      try {
        if (queryRunner.isTransactionActive) {
          await queryRunner.rollbackTransaction();
        }
      } finally {
        await queryRunner.release();
      }
      next(error as Error);
      return;
    }

    if (blocked) {
      try {
        await queryRunner.rollbackTransaction();
      } finally {
        await queryRunner.release();
      }
      next(new ForbiddenException(blocked));
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
