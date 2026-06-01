import { httpRequestDuration } from '@common/monitoring/metrics';
import type { NextFunction, Request, Response } from 'express';

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const stopTimer = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : 'unmatched';
    stopTimer({ method: req.method, route, status: res.statusCode });
  });
  next();
}
