import { OUTBOX_BATCH_SIZE } from '@common/constants';
import { outboxDispatched } from '@common/monitoring/metrics';
import { logger } from '@config/logger';
import { OutboxRepository, type RecordEventInput } from '@modules/outbox/outbox.repository';
import type { OutboxEvent } from '@modules/outbox/outbox-event.entity';
import { Service } from 'typedi';
import { DataSource } from 'typeorm';

/** Delivers one event (e.g. enqueue to BullMQ). Injected so draining stays I/O-agnostic and testable. */
export type OutboxDispatch = (event: OutboxEvent) => Promise<void>;

/** record() commits atomically with the state change; processBatch() claims with FOR UPDATE SKIP LOCKED for concurrent workers and delivers at-least-once, so consumers must be idempotent. */
@Service()
export class OutboxService {
  constructor(
    private readonly outbox: OutboxRepository,
    private readonly dataSource: DataSource,
  ) {}

  /** Records a domain event on the active tenant transaction — atomic with the state change. */
  record(input: RecordEventInput): Promise<OutboxEvent> {
    return this.outbox.record(input);
  }

  async processBatch(dispatch: OutboxDispatch, batchSize = OUTBOX_BATCH_SIZE): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const events = await this.outbox.claimBatch(manager, batchSize);
      let dispatched = 0;
      for (const event of events) {
        try {
          await dispatch(event);
          await this.outbox.markDispatched(manager, event.id);
          outboxDispatched.inc({ result: 'success' });
          dispatched += 1;
        } catch (error) {
          logger.warn(`Outbox dispatch failed for ${event.id}: ${(error as Error).message}`);
          await this.outbox.markFailed(manager, event);
          outboxDispatched.inc({ result: 'failure' });
        }
      }
      return dispatched;
    });
  }
}
