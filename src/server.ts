import path from 'node:path';
import { ResponseInterceptor } from '@common/interceptors/response.interceptor';
import { ErrorHandler } from '@common/middlewares/error-handler.middleware';
import { httpLogger } from '@common/middlewares/http-logger.middleware';
import { metricsMiddleware } from '@common/middlewares/metrics.middleware';
import { registry } from '@common/monitoring/metrics';
import type { ApiError } from '@common/types/response';
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
  routePrefix: '/api',
  defaultErrorHandler: false,
  controllers: [path.join(__dirname, 'modules/**/*.controller.{ts,js}')],
  middlewares: [ErrorHandler],
  interceptors: [ResponseInterceptor],
  classTransformer: true,
  validation: { whitelist: true, forbidNonWhitelisted: true },

  authorizationChecker: (action: Action, roles: string[]) =>
    new Promise<boolean>((resolve) => {
      passport.authenticate('jwt', { session: false }, (_err: unknown, user: User | false) => {
        if (!user) {
          resolve(false);
          return;
        }
        action.request.user = user;
        resolve(roles.length === 0 || roles.some((role) => user.roles.includes(role)));
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
  app.use(express.json({ limit: '1mb' }));
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
    const body: ApiError = {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${req.method} ${req.path} not found`,
      },
    };
    res.status(404).json(body);
  });

  return app;
}
