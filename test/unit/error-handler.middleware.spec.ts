import { ErrorHandler } from '@common/middlewares/error-handler.middleware';
import type { Response } from 'express';
import { QueryFailedError } from 'typeorm';

describe('ErrorHandler', () => {
  let handler: ErrorHandler;
  let res: { status: jest.Mock; json: jest.Mock; headersSent: boolean };

  beforeEach(() => {
    handler = new ErrorHandler();
    res = { status: jest.fn().mockReturnThis(), json: jest.fn(), headersSent: false };
  });

  it('maps a Postgres unique-violation to 409 Conflict', () => {
    const driverError = { code: '23505' };
    const error = new QueryFailedError('INSERT INTO "users" ...', [], driverError as never);

    handler.error(error, {} as never, res as unknown as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'CONFLICT', message: 'Resource already exists', details: undefined },
    });
  });

  it('leaves other QueryFailedErrors as 500', () => {
    const driverError = { code: '23502' };
    const error = new QueryFailedError('INSERT INTO "users" ...', [], driverError as never);

    handler.error(error, {} as never, res as unknown as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
