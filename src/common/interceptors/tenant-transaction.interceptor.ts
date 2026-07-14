import { type Action, Interceptor, type InterceptorInterface } from 'routing-controllers';
import { Service } from 'typedi';

// Commits the per-request tenant tx after the action but before response serialization,
// so a commit failure surfaces as 500 instead of a success reply for rolled-back data.
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
