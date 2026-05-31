import { useContainer } from 'routing-controllers';
import { Container } from 'typedi';

/**
 * Wire TypeDI as the DI container for routing-controllers. MUST run before any
 * controller/middleware is registered so the framework resolves classes
 * (controllers, interceptors, middlewares) through TypeDI.
 *
 * Note: TypeORM 1.x dropped its container integration. Repositories receive the
 * DataSource via TypeDI directly (see Phase 03), so no ORM wiring is needed here.
 */
export function configureContainer(): void {
  useContainer(Container);
}

export { Container };
