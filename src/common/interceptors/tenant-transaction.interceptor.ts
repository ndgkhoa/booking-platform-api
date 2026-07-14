import { type Action, Interceptor, type InterceptorInterface } from 'routing-controllers';
import { Service } from 'typedi';

/**
 * Commits the per-request tenant transaction (opened by TenantContextMiddleware)
 * once a controller action has produced its result but BEFORE the response is
 * serialised. A commit failure therefore propagates as a 500 instead of a
 * success reply for data that rolled back. Non-action paths (auth failures,
 * validation errors, 404s) never reach here — the middleware's finish/close
 * listener rolls those back.
 */
@Service()
@Interceptor()
export class TenantTransactionInterceptor implements InterceptorInterface {
  async intercept(action: Action, content: unknown): Promise<unknown> {
    const request = action.request as import('express').Request;
    const queryRunner = request.tenantTx;
    if (queryRunner && !request.tenantTxSettled) {
      request.tenantTxSettled = true;
      try {
        await queryRunner.commitTransaction();
      } finally {
        await queryRunner.release();
      }
    }
    return content;
  }
}
