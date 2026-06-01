# Phase 02 — Core Infrastructure

**Priority:** Critical | **Status:** pending | **Depends:** 01

Wire the server: typedi container, winston logger, custom exceptions, structured response envelope (interceptor), global error handler, and security middleware chain.

## reflect-metadata + container (order matters)
`src/index.ts` FIRST line: `import 'reflect-metadata';` then everything else.

`src/config/container.ts`:
```ts
import { Container } from 'typedi';
import { useContainer as rcUseContainer } from 'routing-controllers';
export function configureContainer() { rcUseContainer(Container); }
```

## Logger — `src/config/logger.ts` (winston)
- JSON format in prod, colorized console in dev. Level from `env.LOG_LEVEL`.
- Export singleton `logger`. Transports: Console + (prod) File/`combined.log`.

## Morgan → winston — `src/common/middlewares/http-logger.middleware.ts`
```ts
import morgan from 'morgan';
import { logger } from '@config/logger';
export const httpLogger = morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
});
```
(Add `http` level to winston levels, or use `logger.info`.)

## Custom exceptions — `src/common/exceptions/`
Base extends routing-controllers `HttpError` so the framework sets status automatically.
```ts
// app.exception.ts
import { HttpError } from 'routing-controllers';
export class AppException extends HttpError {
  constructor(status: number, public errorCode: string, message: string, public details?: unknown) {
    super(status, message);
    Object.setPrototypeOf(this, AppException.prototype);
  }
}
// concrete: not-found.exception.ts, validation.exception.ts, unauthorized.exception.ts,
// forbidden.exception.ts, conflict.exception.ts  (each passes status+errorCode)
export class NotFoundException extends AppException {
  constructor(msg = 'Resource not found', details?: unknown) { super(404, 'NOT_FOUND', msg, details); }
}
export class ConflictException extends AppException {
  constructor(msg = 'Conflict', details?: unknown) { super(409, 'CONFLICT', msg, details); }
}
// ...Unauthorized(401,'UNAUTHORIZED'), Forbidden(403,'FORBIDDEN'),
//    Validation(422,'VALIDATION_ERROR'), BadRequest(400,'BAD_REQUEST')
```
Barrel `index.ts` re-exports all.

## Response envelope types — `src/common/types/api-response.ts`
```ts
export interface ApiResponse<T> { success: true; data: T; meta?: Record<string, unknown>; timestamp: string; }
export interface ApiError { success: false; error: { code: string; message: string; details?: unknown }; timestamp: string; }
export interface PaginatedMeta { page: number; limit: number; total: number; totalPages: number; }
```

## Success interceptor — `src/common/interceptors/response.interceptor.ts`
Wraps every successful controller return into the envelope. Skip wrapping if already enveloped or for swagger/metrics raw routes.
```ts
import { Interceptor, InterceptorInterface, Action } from 'routing-controllers';
import { Service } from 'typedi';
@Service()
@Interceptor()
export class ResponseInterceptor implements InterceptorInterface {
  intercept(action: Action, content: any) {
    if (content?.success === true || content?.success === false) return content; // already enveloped
    return { success: true, data: content ?? null, timestamp: new Date().toISOString() };
  }
}
```

## Global error handler — `src/common/middlewares/error-handler.middleware.ts`
`@Middleware({ type: 'after' })` implementing `ExpressErrorMiddlewareInterface`. Set `defaultErrorHandler: false` in server options so this owns all errors.
```ts
@Service()
@Middleware({ type: 'after' })
export class ErrorHandler implements ExpressErrorMiddlewareInterface {
  error(error: any, req: Request, res: Response, _next: NextFunction) {
    const status = error.httpCode || error.status || 500;
    const code = error.errorCode || (status === 500 ? 'INTERNAL_ERROR' : 'ERROR');
    // class-validator errors arrive as error.errors (array) → map to details
    const details = error.errors ?? error.details;
    if (status >= 500) logger.error(error.stack || error.message);
    if (!res.headersSent) {
      res.status(status).json({ success: false,
        error: { code, message: status === 500 && env.isProduction ? 'Internal Server Error' : error.message, details },
        timestamp: new Date().toISOString() });
    }
  }
}
```

## Security middlewares — registered as raw Express before routing-controllers
`src/server.ts`:
```ts
import 'reflect-metadata';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';
import { useExpressServer, getMetadataArgsStorage } from 'routing-controllers';
import { configureContainer } from '@config/container';
import { httpLogger } from '@common/middlewares/http-logger.middleware';
import { ResponseInterceptor } from '@common/interceptors/response.interceptor';
import { ErrorHandler } from '@common/middlewares/error-handler.middleware';

export function createServer() {
  configureContainer();
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN ?? '*' }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(hpp());
  app.use(httpLogger);
  app.use('/api', rateLimit({ windowMs: 15*60*1000, max: 100, standardHeaders: true }));

  useExpressServer(app, {
    routePrefix: '/api',
    defaultErrorHandler: false,
    controllers: [__dirname + '/modules/**/*.controller.{ts,js}'],
    middlewares: [ErrorHandler],
    interceptors: [ResponseInterceptor],
    classTransformer: true,           // enables class-transformer (exclude fields)
    validation: { whitelist: true, forbidNonWhitelisted: true }, // class-validator
    // authorizationChecker / currentUserChecker added in phase 04
  });
  return app;
}
```
> Glob controller path works because `tsc-alias` output keeps `.js`; in dev tsx loads `.ts`. Both globs included.

## Files
config/container.ts, config/logger.ts, common/exceptions/*, common/types/api-response.ts, common/interceptors/response.interceptor.ts, common/middlewares/{http-logger,error-handler}.middleware.ts, server.ts, index.ts (bootstrap stub → finalized phase 07)

## Todo
- [ ] logger singleton
- [ ] exception hierarchy + barrel
- [ ] response envelope types + success interceptor
- [ ] global error handler (handles class-validator + AppException + unknown)
- [ ] server.ts security chain + useExpressServer options
- [ ] index.ts: reflect-metadata first, createServer().listen

## Success Criteria
- A trivial `@Get('/api/ping')` returns `{ success:true, data:..., timestamp }`.
- Throwing `new NotFoundException()` returns 404 enveloped error.
- helmet/cors/rate-limit headers present.

## Security
- 500 messages hidden in production. Rate-limit on `/api`. hpp + helmet defaults. JSON body capped 1mb.
