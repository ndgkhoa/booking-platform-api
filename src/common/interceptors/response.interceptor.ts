import { type Action, Interceptor, type InterceptorInterface } from 'routing-controllers';
import { Service } from 'typedi';

/**
 * Global interceptor that wraps every successful controller return value in the
 * standard success envelope. Payloads that are already enveloped (e.g. paginated
 * results) pass through unchanged.
 */
@Service()
@Interceptor()
export class ResponseInterceptor implements InterceptorInterface {
  intercept(_action: Action, content: unknown): unknown {
    if (content && typeof content === 'object' && 'success' in content) {
      return content; // already enveloped — do not double-wrap
    }
    return {
      success: true,
      data: content ?? null,
      timestamp: new Date().toISOString(),
    };
  }
}
