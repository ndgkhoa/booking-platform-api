import path from 'node:path';
import { ResponseInterceptor } from '@common/interceptors/response.interceptor';
import { TenantTransactionInterceptor } from '@common/interceptors/tenant-transaction.interceptor';
import { ErrorHandler } from '@common/middlewares/error-handler.middleware';
import { httpLogger } from '@common/middlewares/http-logger.middleware';
import { metricsMiddleware } from '@common/middlewares/metrics.middleware';
import { TenantContextMiddleware } from '@common/middlewares/tenant-context.middleware';
import { registry } from '@common/monitoring/metrics';
import { buildProblem, PROBLEM_CONTENT_TYPE } from '@common/types/problem-details';
import { env } from '@config/env';
import { buildOpenApiSpec } from '@config/swagger';
import { configurePassport } from '@modules/auth/jwt.strategy';
import type { User } from '@modules/user/user.entity';
import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import hpp from 'hpp';
import passport from 'passport';
import {
  type Action,
  type RoutingControllersOptions,
  useContainer,
  useExpressServer,
} from 'routing-controllers';
import swaggerUi from 'swagger-ui-express';
import { Container } from 'typedi';

export const routingControllersOptions: RoutingControllersOptions = {
  routePrefix: '/api/v1',
  defaultErrorHandler: false,
  controllers: [path.join(__dirname, 'modules/**/*.controller.{ts,js}')],
  middlewares: [TenantContextMiddleware, ErrorHandler],
  interceptors: [TenantTransactionInterceptor, ResponseInterceptor],
  classTransformer: true,
  validation: { whitelist: true, forbidNonWhitelisted: true },

  // Role is resolved from the active-tenant membership carried in the token
  // claims (set by TenantContextMiddleware). super_admin bypasses tenant scope.
  authorizationChecker: (action: Action, roles: string[]) =>
    new Promise<boolean>((resolve) => {
      passport.authenticate('jwt', { session: false }, (_err: unknown, user: User | false) => {
        if (!user) {
          resolve(false);
          return;
        }
        action.request.user = user;
        if (user.isSuperAdmin) {
          resolve(true);
          return;
        }
        if (roles.length === 0) {
          resolve(true);
          return;
        }
        const role = action.request.tokenClaims?.role;
        resolve(role != null && roles.includes(role));
      })(action.request, action.response, () => undefined);
    }),

  currentUserChecker: (action: Action) => action.request.user,
};

export function createServer(): Express {
  useContainer(Container);

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(
    express.json({
      limit: '1mb',
      // Keep the raw bytes so webhook signatures verify against exactly what was sent.
      verify: (req, _res, buf) => {
        (req as Request).rawBody = buf.toString('utf8');
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(hpp());
  app.use(httpLogger);
  app.use(metricsMiddleware);

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

  if (env.SWAGGER_ENABLED) {
    const spec = buildOpenApiSpec(routingControllersOptions);
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec));
    app.get('/api-docs.json', (_req: Request, res: Response) => {
      res.json(spec);
    });
  }

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next();
      return;
    }
    const problem = buildProblem({
      status: 404,
      code: 'NOT_FOUND',
      detail: `Route ${req.method} ${req.path} not found`,
      instance: req.originalUrl,
    });
    res.status(404).type(PROBLEM_CONTENT_TYPE).json(problem);
  });

  return app;
}
