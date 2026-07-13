import { OutboxRepository, type RecordEventInput } from '@modules/outbox/outbox.repository';
import type { OutboxEvent } from '@modules/outbox/outbox-event.entity';
import { Service } from 'typedi';

/**
 * Write facade for the transactional outbox. Domain modules depend on this
 * instead of the repository, so event recording stays a stable, intent-revealing
 * seam and the repository's persistence details remain internal to the module.
 */
@Service()
export class OutboxService {
  constructor(private readonly outbox: OutboxRepository) {}

  /** Records a domain event on the active tenant transaction — atomic with the state change. */
  record(input: RecordEventInput): Promise<OutboxEvent> {
    return this.outbox.record(input);
  }
}
