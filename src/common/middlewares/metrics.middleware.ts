import { httpRequestDuration } from '@health/metrics';
import type { NextFunction, Request, Response } from 'express';

/**
 * Times every request and records it into the Prometheus histogram on response
 * finish. Uses the matched route pattern (e.g. `/users/:id`) as the label to
 * keep cardinality bounded — falls back to `unmatched` when no route matched.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const stopTimer = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : 'unmatched';
    stopTimer({ method: req.method, route, status: res.statusCode });
  });
  next();
}
