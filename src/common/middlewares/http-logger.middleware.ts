import { logger } from '@config/logger';
import morgan from 'morgan';

/**
 * Express request logger. Pipes morgan output into winston's `http` level so all
 * logs share a single structured transport.
 */
export const httpLogger = morgan('combined', {
  stream: { write: (message: string) => logger.http(message.trim()) },
});
