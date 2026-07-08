import { type Action, Interceptor, type InterceptorInterface } from 'routing-controllers';
import { Service } from 'typedi';

@Service()
@Interceptor()
export class ResponseInterceptor implements InterceptorInterface {
  intercept(_action: Action, content: unknown): unknown {
    if (content === undefined) {
      return content;
    }
    if (content && typeof content === 'object' && 'success' in content) {
      return content;
    }
    return {
      success: true,
      data: content ?? null,
    };
  }
}
