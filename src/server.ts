import path from 'node:path';
import { ResponseInterceptor } from '@common/interceptors/response.interceptor';
import { ErrorHandler } from '@common/middlewares/error-handler.middleware';
import { httpLogger } from '@common/middlewares/http-logger.middleware';
import { metricsMiddleware } from '@common/middlewares/metrics.middleware';
import type { ApiError } from '@common/types/api-response';
import { configureContainer } from '@config/container';
import { env } from '@config/env';
import { buildOpenApiSpec } from '@config/swagger';
import { registry } from '@health/metrics';
import { configurePassport } from '@modules/auth/jwt.strategy';
import type { User } from '@modules/user/user.entity';
import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import hpp from 'hpp';
import passport from 'passport';
import { type Action, type RoutingControllersOptions, useExpressServer } from 'routing-controllers';
import swaggerUi from 'swagger-ui-express';

/** Express request augmented with the authenticated user by passport-jwt. */
type AuthedRequest = Request & { user?: User };

/**
 * Shared routing-controllers options. Exported so the OpenAPI spec generator
 * (Phase 05) builds against the exact same configuration the server runs with.
 * `authorizationChecker` / `currentUserChecker` are added in Phase 04.
 */
export const routingControllersOptions: RoutingControllersOptions = {
  routePrefix: '/api',
  defaultErrorHandler: false, // ErrorHandler owns all error responses
  controllers: [path.join(__dirname, 'modules/**/*.controller.{ts,js}')],
  middlewares: [ErrorHandler],
  interceptors: [ResponseInterceptor],
  classTransformer: true, // honour class-transformer @Exclude/@Expose on responses
  validation: { whitelist: true, forbidNonWhitelisted: true }, // class-validator on @Body

  // @Authorized() gate: authenticate via passport-jwt, then check roles.
  authorizationChecker: (action: Action, roles: string[]) =>
    new Promise<boolean>((resolve) => {
      passport.authenticate('jwt', { session: false }, (_err: unknown, user: User | false) => {
        if (!user) {
          resolve(false);
          return;
        }
        (action.request as AuthedRequest).user = user;
        resolve(roles.length === 0 || roles.some((role) => user.roles.includes(role)));
      })(action.request, action.response, () => undefined);
    }),

  // Supplies the @CurrentUser() value (populated above by the authorizationChecker).
  currentUserChecker: (action: Action) => (action.request as AuthedRequest).user,
};

/**
 * Build the Express application: DI wiring, security middleware chain, then
 * routing-controllers. Does NOT start listening — the bootstrap (index.ts) owns
 * the HTTP server lifecycle.
 */
export function createServer(): Express {
  configureContainer();

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(hpp());
  app.use(httpLogger);
  app.use(metricsMiddleware);

  // Prometheus scrape endpoint — raw text, not wrapped in the response envelope.
  if (env.METRICS_ENABLED) {
    app.get('/metrics', async (_req: Request, res: Response) => {
      res.set('Content-Type', registry.contentType);
      res.end(await registry.metrics());
    });
  }

  configurePassport();
  app.use(passport.initialize());

  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 100,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  useExpressServer(app, routingControllersOptions);

  // OpenAPI docs (built after controllers are registered above). Disable in prod
  // via SWAGGER_ENABLED=false if the API should not be publicly documented.
  if (env.SWAGGER_ENABLED) {
    const spec = buildOpenApiSpec(routingControllersOptions);
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec));
    app.get('/api-docs.json', (_req: Request, res: Response) => {
      res.json(spec);
    });
  }

  // Enveloped JSON 404 for routes not matched by any controller (routing-controllers
  // falls through to Express here, which would otherwise return an HTML error page).
  // Guard against the error path, where the ErrorHandler has already responded.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next();
      return;
    }
    const body: ApiError = {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${req.method} ${req.path} not found`,
      },
      timestamp: new Date().toISOString(),
    };
    res.status(404).json(body);
  });

  return app;
}
