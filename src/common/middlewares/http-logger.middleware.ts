import { logger } from '@config/logger';
import morgan from 'morgan';

export const httpLogger = morgan('combined', {
  stream: { write: (message: string) => logger.http(message.trim()) },
});
